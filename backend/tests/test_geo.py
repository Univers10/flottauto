from app.services import geo


def test_odienne_line_by_road():
    d = geo.road_distance("Gare d'Abobo", "ODIENNE")
    assert d["method"] == "road" and d["from_city"] == "Abobo" and d["to_city"] == "Odienné"
    assert d["via"][-4:] == ["Boundiali", "Madinani", "Tiémé", "Odienné"]
    assert 750 <= d["km"] <= 900


def test_new_stations_and_unknown_town():
    assert geo.road_distance("Tieme", "Madinani")["km"] == 50
    assert geo.road_distance("Abidjan", "Atlantis") is None
    assert geo.road_distance("Bouaké", "Bouaké")["km"] == 0


def test_distance_route(client, auth):
    from app import models

    h = auth(models.Role.STATION_MANAGER)
    r = client.get("/api/v1/stations/distance", params={"origin": "Yamoussoukro", "destination": "Bouaké"}, headers=h)
    assert r.status_code == 200 and r.json()["km"] == 105
    assert client.get("/api/v1/stations/distance", params={"origin": "Yakro", "destination": "Nulle-part"}, headers=h).status_code == 404
