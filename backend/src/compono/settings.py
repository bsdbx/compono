from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://compono:compono@127.0.0.1:5433/compono"


settings = Settings()
