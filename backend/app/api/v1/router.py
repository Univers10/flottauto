from fastapi import APIRouter, Depends

from app import models
from app.api.deps import deny_roles
from app.api.v1 import auth, vehicles, drivers, maintenance, dashboard, alerts, tolls, fuel, stations, settings

R = models.Role
# Maintenanciers : maintenance, alertes et flotte en lecture seule.
# Convoyeurs : aucun module pour l'instant (ils signent les états des lieux en phase 1).
no_mechanic = [Depends(deny_roles(R.MECHANIC, R.CONVEYOR))]
mechanic_read_only = [Depends(deny_roles(R.MECHANIC, allow_read=True)), Depends(deny_roles(R.CONVEYOR))]
no_conveyor = [Depends(deny_roles(R.CONVEYOR))]

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(vehicles.router, prefix="/vehicles", tags=["vehicles"], dependencies=mechanic_read_only)
api_router.include_router(drivers.router, prefix="/drivers", tags=["drivers"], dependencies=no_mechanic)
api_router.include_router(maintenance.router, prefix="/maintenance", tags=["maintenance"], dependencies=no_conveyor)
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"], dependencies=no_mechanic)
api_router.include_router(alerts.router, prefix="/alerts", tags=["alerts"], dependencies=no_conveyor)
api_router.include_router(tolls.router, prefix="/tolls", tags=["tolls"], dependencies=no_mechanic)
api_router.include_router(fuel.router, prefix="/fuel", tags=["fuel"], dependencies=no_mechanic)
api_router.include_router(stations.router, prefix="/stations", tags=["stations"], dependencies=no_mechanic)
api_router.include_router(settings.router, prefix="/settings", tags=["settings"], dependencies=no_mechanic)
