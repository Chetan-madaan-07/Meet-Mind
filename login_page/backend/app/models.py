import datetime
from sqlalchemy import Column, Integer, String, DateTime
from app.database import Base


class User(Base):
    """User model for authentication."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<User(id={self.id}, name='{self.name}', email='{self.email}')>"
