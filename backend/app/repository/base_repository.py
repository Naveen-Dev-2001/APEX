from typing import Any, Dict, Generic, List, Optional, Type, TypeVar, Union
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select, update, delete, asc, desc, or_

from app.database.database import Base

ModelType = TypeVar("ModelType", bound=Base)
CreateSchemaType = TypeVar("CreateSchemaType", bound=BaseModel)
UpdateSchemaType = TypeVar("UpdateSchemaType", bound=BaseModel)


class BaseRepository(Generic[ModelType, CreateSchemaType, UpdateSchemaType]):
    def __init__(self, model: Type[ModelType]):
        """
        Repository object with default methods to Create, Read, Update, Delete (CRUD).

        **Parameters**

        * `model`: A SQLAlchemy model class
        * `schema`: A Pydantic model (schema) class
        """
        self.model = model

    def get(self, db: Session, id: Any) -> Optional[ModelType]:
        return db.query(self.model).filter(self.model.id == id).first()

    def get_for_update(self, db: Session, id: Any) -> Optional[ModelType]:
        return db.query(self.model).filter(self.model.id == id).with_for_update().first()
    def get_multi(
        self, 
        db: Session, 
        *, 
        skip: int = 0, 
        limit: int = 100, 
        filters: Dict[str, Any] = None,
        order_by: str = None,
        descending: bool = False
    ) -> List[ModelType]:
        query = db.query(self.model)
        if filters:
            for field, value in filters.items():
                if hasattr(self.model, field):
                    query = query.filter(getattr(self.model, field) == value)
        
        if order_by and hasattr(self.model, order_by):
            column = getattr(self.model, order_by)
            if descending:
                query = query.order_by(desc(column))
            else:
                query = query.order_by(asc(column))
        elif order_by is None:
            # Default order
            query = query.order_by(self.model.id)

        return query.offset(skip).limit(limit).all()

    def get_paginated(
        self,
        db: Session,
        *,
        skip: int = 0,
        limit: int = 100,
        filters: Dict[str, Any] = None,
        search: str = None,
        search_fields: List[str] = None,
        order_by: str = None,
        descending: bool = False
    ) -> Dict[str, Any]:
        """
        Generic paginated query with search and filtering.
        """

        query = db.query(self.model)

        # Filters (exact match)
        if filters:
            for field, value in filters.items():
                if hasattr(self.model, field):
                    query = query.filter(getattr(self.model, field) == value)

        # Search (ILIKE across multiple fields)
        if search and search_fields:
            search_filter = f"%{search}%"
            search_expressions = []
            for field in search_fields:
                if hasattr(self.model, field):
                    search_expressions.append(getattr(self.model, field).ilike(search_filter))
            if search_expressions:
                query = query.filter(or_(*search_expressions))

        # Total Count (before offset/limit)
        total = query.count()

        # Sorting
        if order_by and hasattr(self.model, order_by):
            sort_attr = getattr(self.model, order_by)
            query = query.order_by(desc(sort_attr) if descending else asc(sort_attr))
        else:
            query = query.order_by(self.model.id)

        # Offset & Limit
        data = query.offset(skip).limit(limit).all()

        return {
            "data": data,
            "total": total,
            "page": (skip // limit) + 1 if limit > 0 else 1,
            "page_size": limit
        }

    def create(self, db: Session, *, obj_in: Union[CreateSchemaType, Dict[str, Any]]) -> ModelType:
        if isinstance(obj_in, self.model):
            db_obj = obj_in
        else:
            if isinstance(obj_in, dict):
                obj_in_data = obj_in
            else:
                obj_in_data = obj_in.dict(exclude_unset=True)
            db_obj = self.model(**obj_in_data)
        
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update(
        self,
        db: Session,
        *,
        db_obj: ModelType,
        obj_in: Union[UpdateSchemaType, Dict[str, Any]]
    ) -> ModelType:
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.dict(exclude_unset=True)

        for field, value in update_data.items():
            if hasattr(db_obj, field):
                setattr(db_obj, field, value)

        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def remove(self, db: Session, *, id: int) -> ModelType:
        obj = db.query(self.model).get(id)
        db.delete(obj)
        db.commit()
        return obj

    def bulk_create(self, db: Session, *, obj_list: List[Dict[str, Any]]) -> int:
        """
        Optimized bulk insert using mappings.
        """
        if not obj_list:
            return 0
        db.bulk_insert_mappings(self.model, obj_list)
        db.commit()
        return len(obj_list)

    def delete_all(self, db: Session, filters: Dict[str, Any] = None) -> int:
        """
        Fast bulk deletion.
        """
        query = db.query(self.model)
        if filters:
            for field, value in filters.items():
                if hasattr(self.model, field):
                    query = query.filter(getattr(self.model, field) == value)
        
        count = query.delete(synchronize_session=False)
        db.commit()
        return count

    def count(self, db: Session, filters: Dict[str, Any] = None, expressions: List[Any] = None) -> int:
        """
        Get total count of records matching filters.
        """
        from sqlalchemy import func
        query = db.query(func.count(self.model.id))
        if filters:
            for field, value in filters.items():
                if hasattr(self.model, field):
                    query = query.filter(getattr(self.model, field) == value)
        if expressions:
            for expr in expressions:
                query = query.filter(expr)
        return query.scalar()
