from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import authenticate_user, create_access_token
from app.api.deps import get_current_user

router = APIRouter()
settings = get_settings()


@router.post("/register", response_model=schemas.Token)
def register_first_admin(
    payload: schemas.UserCreate,
    company_in: schemas.CompanyCreate,
    db: Session = Depends(get_db),
):
    """Onboarding : crée la première entreprise et son admin.
    Cet endpoint est public et permet l'initialisation."""
    if crud.get_company_by_slug(db, company_in.slug):
        raise HTTPException(status_code=400, detail="Company slug already exists")
    if crud.get_user_by_email(db, payload.email):
        raise HTTPException(status_code=400, detail="Email already registered")

    company = crud.create_company(db, company_in)
    user = crud.create_user(db, payload, company_id=company.id)
    access_token = create_access_token({"sub": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/login", response_model=schemas.Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token({"sub": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=schemas.UserRead)
def read_current_user(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.post("/users", response_model=schemas.UserRead)
def create_user(
    payload: schemas.UserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in (models.Role.ADMIN, models.Role.MANAGER, models.Role.SUPER_ADMIN):
        raise HTTPException(status_code=403, detail="Not allowed")
    if current_user.company_id is None:
        raise HTTPException(status_code=400, detail="User has no company")
    if crud.get_user_by_email(db, payload.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    return crud.create_user(db, payload, company_id=current_user.company_id)


@router.get("/users", response_model=list[schemas.UserRead])
def list_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.company_id is None:
        return []
    return crud.list_users_by_company(db, current_user.company_id)
