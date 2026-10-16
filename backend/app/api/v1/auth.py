from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import authenticate_user, create_access_token
from app.api.deps import get_current_user, require_role

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


USER_ADMIN_ROLES = (models.Role.ADMIN, models.Role.SUPER_ADMIN)


@router.post("/users", response_model=schemas.UserRead, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: schemas.UserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role(*USER_ADMIN_ROLES)),
):
    if current_user.company_id is None:
        raise HTTPException(status_code=400, detail="User has no company")
    if payload.role == models.Role.SUPER_ADMIN and current_user.role != models.Role.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Not allowed")
    if crud.get_user_by_email(db, payload.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    return crud.create_user(db, payload, company_id=current_user.company_id)


@router.get("/users", response_model=list[schemas.UserRead])
def list_users(
    role: models.Role | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role(*USER_ADMIN_ROLES, models.Role.MANAGER)),
):
    if current_user.company_id is None:
        return []
    return crud.list_users_by_company(db, current_user.company_id, role=role)


@router.put("/users/{user_id}", response_model=schemas.UserRead)
def update_user(
    user_id: int,
    payload: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role(*USER_ADMIN_ROLES)),
):
    user = crud.get_user(db, user_id)
    if not user or user.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.role == models.Role.SUPER_ADMIN and current_user.role != models.Role.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Not allowed")
    if user.id == current_user.id and (payload.is_active is False or payload.role not in (None, current_user.role)):
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas désactiver ou rétrograder votre propre compte")
    return crud.update_user(db, user, payload)
