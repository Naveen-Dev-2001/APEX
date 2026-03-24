import requests

def verify_delegations_route():
    # Login as admin
    login_url = "http://localhost:8014/auth/login"
    login_data = {
        "email": "admin@example.com",
        "password": "admin123"
    }
    
    print(f"Attempting login at {login_url}...")
    try:
        login_response = requests.post(login_url, json=login_data)
        if login_response.status_code != 200:
            print(f"Login failed: {login_response.status_code}")
            return
        
        token = login_response.json().get('access_token')
        print("Login successful!")
        
        # Test the NEW endpoint
        delegations_url = "http://localhost:8014/delegations/"
        headers = {"Authorization": f"Bearer {token}"}
        
        print(f"Testing new endpoint: {delegations_url}...")
        resp = requests.get(delegations_url, headers=headers)
        
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            print("SUCCESS: Endpoint /delegations/ is now working!")
        else:
            print(f"FAILED: Status {resp.status_code}")
            print(f"Response: {resp.text}")
            
    except Exception as e:
        print(f"Error connecting to server: {e}")

if __name__ == "__main__":
    verify_delegations_route()
