from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://compono:compono@127.0.0.1:5433/compono"
    # Neon's direct connection, without its pooler, for migrations. Only on Vercel.
    database_url_unpooled: str | None = None


settings = Settings()
