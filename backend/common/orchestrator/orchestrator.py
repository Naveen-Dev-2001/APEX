import os
from typing import Dict, Any
from pathlib import Path
from common.agents.extraction_agent import InvoiceExtractionAgent, InvoiceState

class InvoiceOrchestrator:
    def __init__(self):
        self.extraction_agent = InvoiceExtractionAgent()

    async def process_invoice(self, file_path: str, output_dir: str = "output", is_cancelled_callback=None) -> Dict[str, Any]:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Invoice file not found: {file_path}")

        os.makedirs(output_dir, exist_ok=True)

        print(f"Starting invoice processing: {file_path}")

        try:
            import time
            total_start = time.time()

            # Helper to check cancellation
            def check_cancel():
                if is_cancelled_callback and is_cancelled_callback():
                    raise Exception("cancelled")

            # Use the extraction agent directly
            initial_state: InvoiceState = InvoiceState(
                file_path=file_path,
                raw_azure_response=None,
                llm_prompt=None,
                llm_raw_response=None,
                extracted_data={},
                enhanced_data={},
                validated_data={},
                final_output={},
                errors=[],
                processing_steps=[]
            )

            # Check before starting
            check_cancel()

            # Step 1: Azure Extraction
            import time
            step_start = time.time()
            state = await self.extraction_agent.extract_with_azure_doc_intel(initial_state, is_cancelled_callback=is_cancelled_callback)
            print(f"[Orchestrator] Azure extraction step completed in {time.time() - step_start:.2f}s")
            
            if state["errors"]:
                raise Exception(state["errors"][-1])
            
            # Check after Azure
            check_cancel()

            # Step 2: LLM Enhancement
            step_start = time.time()
            state = await self.extraction_agent.enhance_with_llm(state, is_cancelled_callback=is_cancelled_callback)
            print(f"[Orchestrator] LLM enhancement step completed in {time.time() - step_start:.2f}s")
            
            if state["errors"]:
                raise Exception(state["errors"][-1])
            
            # Check after LLM
            check_cancel()

            # Step 3: Validation
            step_start = time.time()
            state = self.extraction_agent.validate_data(state)
            print(f"[Orchestrator] Data validation step completed in {time.time() - step_start:.2f}s")
            
            # Step 4: Final Output
            step_start = time.time()
            state = self.extraction_agent.generate_final_output(state)
            print(f"[Orchestrator] Final output generation step completed in {time.time() - step_start:.2f}s")

            final_output = state["final_output"]

            print(f"Invoice processing completed successfully in {time.time() - total_start:.2f}s")
            return final_output

        except Exception as e:
            print(f"Invoice processing failed: {e}")
            raise

    async def process_batch(self, input_folder: str, output_dir: str = "output"):
        import glob
        import asyncio

        pdf_files = glob.glob(os.path.join(input_folder, "*.pdf"))

        if not pdf_files:
            print("No PDF files found in the input folder.")
            return []

        print(f"Starting async batch processing for {len(pdf_files)} invoices")
        os.makedirs(output_dir, exist_ok=True)

        tasks = [self.process_invoice(pdf, output_dir) for pdf in pdf_files]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        final_results = []
        errors = []

        for pdf_file, result in zip(pdf_files, results):
            if isinstance(result, Exception):
                print(f"Error processing {pdf_file}: {str(result)}")
                errors.append((pdf_file, str(result)))
            else:
                final_results.append(result)
                print(f"Successfully processed: {pdf_file}")

        print("====== BATCH SUMMARY ======")
        print(f"Total invoices found: {len(pdf_files)}")
        print(f"Successfully processed: {len(final_results)}")
        print(f"Failed: {len(errors)}")

        if errors:
            print("Failed files:")
            for pdf, err in errors:
                print(f"  - {pdf}: {err}")

        return results

    async def close(self):
        if hasattr(self, "extraction_agent") and self.extraction_agent:
            await self.extraction_agent.close()