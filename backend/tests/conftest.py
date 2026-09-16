import os, uuid, pytest, requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://await-android.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def base():
    return API


@pytest.fixture(scope="session")
def alex_token(api):
    """Login as seeded alex user."""
    r = api.post(f"{API}/auth/login", json={"email": "alex@example.com", "password": "password123"})
    if r.status_code != 200:
        # Register if not yet
        r = api.post(f"{API}/auth/register", json={"name": "Alex", "email": "alex@example.com", "password": "password123"})
    assert r.status_code in (200, 201), r.text
    return r.json()["session_token"]


@pytest.fixture(scope="session")
def alex_h(alex_token):
    return {"Authorization": f"Bearer {alex_token}", "Content-Type": "application/json"}


@pytest.fixture()
def fresh_user(api):
    email = f"test_{uuid.uuid4().hex[:10]}@example.com"
    r = api.post(f"{API}/auth/register", json={"name": "TestUser", "email": email, "password": "password123"})
    assert r.status_code in (200, 201), r.text
    data = r.json()
    return {"email": email, "token": data["session_token"], "user": data["user"],
            "headers": {"Authorization": f"Bearer {data['session_token']}", "Content-Type": "application/json"}}
