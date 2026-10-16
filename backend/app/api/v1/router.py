from fastapi import APIRouter, Depends

from app import models
from app.api.deps import deny_roles
from app.api.v1 import auth, vehicles, drivers, maintenance, dashboard, alerts, tolls, fuel

# Les maintenanciers n'accèdent qu'à la maintenance, aux alertes et à la flotte en lecture seule.
no_mechanic = [Depends(deny_roles(models.Role.MECHANIC))]
mechanic_read_only = [Depends(deny_roles(models.Role.MECHANIC, allow_read=True))]

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(vehicles.router, prefix="/vehicles", tags=["vehicles"], dependencies=mechanic_read_only)
api_router.include_router(drivers.router, prefix="/drivers", tags=["drivers"], dependencies=no_mechanic)
api_router.include_router(maintenance.router, prefix="/maintenance", tags=["maintenance"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"], dependencies=no_mechanic)
api_router.include_router(alerts.router, prefix="/alerts", tags=["alerts"])
api_router.include_router(tolls.router, prefix="/tolls", tags=["tolls"], dependencies=no_mechanic)
api_router.include_router(fuel.router, prefix="/fuel", tags=["fuel"], dependencies=no_mechanic)
