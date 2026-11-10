"""API Tests."""

from fastapi.testclient import TestClient

from compono.app import Health


def test_health_reaches_the_database(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert Health.model_validate_json(response.text) == Health(status="ok")
