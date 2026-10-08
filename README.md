# Yupi Global

Plateforme de vente de produits de sante avec une boutique React et une API Flask.

## Structure

- `frontend/` : application React + Vite.
- `backend/` : API Flask, modele de donnees SQLAlchemy et migrations Alembic.

## Demarrage local

### API

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:FLASK_APP = "run.py"
$env:SECRET_KEY = "remplacer-par-une-cle-aleatoire-longue"
$env:JWT_SECRET_KEY = "remplacer-par-une-autre-cle-aleatoire-longue"
flask db upgrade
flask run --debug
```

L'API repond sur `http://127.0.0.1:5000/api/health`. SQLite est utilise par defaut. Pour PostgreSQL, definir `DATABASE_URL` avant de lancer Flask. Les cles ne doivent jamais etre versionnees.

Creer le premier compte privilegie avec `flask create-super-admin` ; le mot de passe est saisi de maniere masquee. La connexion API est disponible sur `POST /api/auth/login`. Les jetons expirent apres 30 minutes et peuvent etre revoques avec `POST /api/auth/logout`.

### Catalogue API

Lecture publique :

- `GET /api/catalog/categories`
- `GET /api/catalog/products` et `GET /api/catalog/products/<slug>`
- `GET /api/catalog/kits` et `GET /api/catalog/kits/<slug>`
- Ajouter `?category=<slug>` aux listes pour filtrer par categorie.
- `GET /api/catalog/testimonials` ; filtrer avec `?product=<slug>` ou `?kit=<slug>`.
- `GET /api/catalog/products/<slug>/reviews` et `GET /api/catalog/kits/<slug>/reviews`.
- `POST` sur ces routes d'avis accepte `author_name`, `rating` et `body`. Chaque avis reste en attente de validation et l'API limite les envois a cinq par heure et par adresse IP.

Gestion des categories, produits et kits : `GET`, `POST`, `PATCH` et `DELETE` sur `/api/admin/catalog/categories`, `/api/admin/catalog/products` et `/api/admin/catalog/kits`. Les routes admin exigent un jeton Bearer d'un compte `admin` ou `super_admin`. La suppression desactive l'entree pour conserver les references des commandes.

Gestion des temoignages : `GET`, `POST`, `PATCH` et `DELETE` sur `/api/admin/testimonials`. Les avis sont consultables sur `/api/admin/reviews` et leur statut se modere avec `PATCH /api/admin/reviews/<id>` (`pending`, `approved` ou `rejected`). Seuls les temoignages publies et les avis approuves sont visibles publiquement.

La composition d'un kit utilise une liste `items`, chaque element contenant `product_id` et `quantity`. Les prix sont transmis en decimal, par exemple `"19.50"`.

La limitation de frequence utilise `memory://` en developpement. En production, definir `RATELIMIT_STORAGE_URI` vers un stockage partage comme Redis.

### Interface web

```powershell
cd frontend
npm install
npm run dev
```

## Tests

Depuis `backend/`, lancer `python -m pytest`.
