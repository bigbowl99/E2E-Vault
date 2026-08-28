use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultItem {
    pub id: String,
    pub r#type: String, // 'text' or 'file'
    pub title: Option<String>,
    pub content: Option<String>,
    pub file_path: Option<String>,
    pub tags: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Contact {
    pub id: String,
    pub name: String,
    pub public_key: String,
    pub created_at: String,
}

#[derive(Clone)]
pub struct DbManager {
    pool: Pool<SqliteConnectionManager>,
}

impl DbManager {
    pub fn init() -> Result<Self, String> {
        let home_dir = dirs::home_dir().ok_or("Could not determine user home directory")?;
        let vault_dir = home_dir.join(".e2e_vault");
        std::fs::create_dir_all(&vault_dir)
            .map_err(|e| format!("Failed to create vault directory: {}", e))?;
        
        let db_path: PathBuf = vault_dir.join("vault.db");
        let manager = SqliteConnectionManager::file(db_path);
        let pool = Pool::new(manager)
            .map_err(|e| format!("Failed to create connection pool: {}", e))?;

        let conn = pool.get().map_err(|e| format!("Failed to get DB connection: {}", e))?;

        // Initialize schema
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS vault_items (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                title TEXT,
                content TEXT,
                file_path TEXT,
                tags TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS contacts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                public_key TEXT NOT NULL UNIQUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_vault_items_created_at ON vault_items (created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts (name ASC);
            "#,
        )
        .map_err(|e| format!("Failed to initialize database schema: {}", e))?;

        Ok(Self { pool })
    }

    pub fn insert_vault_item(&self, item: &VaultItem) -> Result<(), String> {
        let conn = self.pool.get().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO vault_items (id, type, title, content, file_path, tags, created_at) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, COALESCE(?7, datetime('now')))",
            params![
                item.id,
                item.r#type,
                item.title,
                item.content,
                item.file_path,
                item.tags,
                item.created_at
            ],
        )
        .map_err(|e| format!("Failed to insert vault item: {}", e))?;
        Ok(())
    }

    pub fn get_vault_items(&self, search: Option<&str>, tag: Option<&str>) -> Result<Vec<VaultItem>, String> {
        let conn = self.pool.get().map_err(|e| e.to_string())?;
        
        let mut query = "SELECT id, type, title, content, file_path, tags, datetime(created_at, 'localtime') as created_at FROM vault_items WHERE 1=1".to_string();
        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(s) = search {
            if !s.trim().is_empty() {
                query.push_str(" AND (title LIKE ? OR content LIKE ?)");
                let pattern = format!("%{}%", s.trim());
                params_vec.push(Box::new(pattern.clone()));
                params_vec.push(Box::new(pattern));
            }
        }

        if let Some(t) = tag {
            if !t.trim().is_empty() {
                query.push_str(" AND tags LIKE ?");
                let pattern = format!("%{}%", t.trim());
                params_vec.push(Box::new(pattern));
            }
        }

        query.push_str(" ORDER BY created_at DESC");

        let mut stmt = conn.prepare(&query).map_err(|e| format!("Query prepare error: {}", e))?;
        
        let rusqlite_params: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();

        let rows = stmt
            .query_map(rusqlite_params.as_slice(), |row| {
                Ok(VaultItem {
                    id: row.get(0)?,
                    r#type: row.get(1)?,
                    title: row.get(2)?,
                    content: row.get(3)?,
                    file_path: row.get(4)?,
                    tags: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })
            .map_err(|e| format!("Query map error: {}", e))?;

        let mut items = Vec::new();
        for r in rows {
            items.push(r.map_err(|e| format!("Row read error: {}", e))?);
        }
        Ok(items)
    }

    pub fn delete_vault_item(&self, id: &str) -> Result<(), String> {
        let conn = self.pool.get().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM vault_items WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete item: {}", e))?;
        Ok(())
    }

    pub fn update_vault_item_tags(&self, id: &str, tags: &str) -> Result<(), String> {
        let conn = self.pool.get().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE vault_items SET tags = ?1 WHERE id = ?2",
            params![tags, id],
        )
        .map_err(|e| format!("Failed to update tags: {}", e))?;
        Ok(())
    }

    pub fn save_contact(&self, name: &str, public_key: &str) -> Result<Contact, String> {
        let conn = self.pool.get().map_err(|e| e.to_string())?;
        let clean_pubkey = public_key.trim().trim_start_matches("PUBKEY::").trim();
        let id = uuid::Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO contacts (id, name, public_key) VALUES (?1, ?2, ?3)
             ON CONFLICT(public_key) DO UPDATE SET name = excluded.name",
            params![id, name.trim(), clean_pubkey],
        )
        .map_err(|e| format!("Failed to save contact: {}", e))?;

        // Retrieve saved contact
        let mut stmt = conn
            .prepare("SELECT id, name, public_key, datetime(created_at, 'localtime') FROM contacts WHERE public_key = ?1")
            .map_err(|e| e.to_string())?;
        let contact = stmt
            .query_row(params![clean_pubkey], |row| {
                Ok(Contact {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    public_key: row.get(2)?,
                    created_at: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?;

        Ok(contact)
    }

    pub fn get_contacts(&self) -> Result<Vec<Contact>, String> {
        let conn = self.pool.get().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, name, public_key, datetime(created_at, 'localtime') FROM contacts ORDER BY name ASC")
            .map_err(|e| format!("Prepare query failed: {}", e))?;

        let rows = stmt
            .query_map([], |row| {
                Ok(Contact {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    public_key: row.get(2)?,
                    created_at: row.get(3)?,
                })
            })
            .map_err(|e| format!("Query map failed: {}", e))?;

        let mut contacts = Vec::new();
        for r in rows {
            contacts.push(r.map_err(|e| format!("Row read error: {}", e))?);
        }
        Ok(contacts)
    }

    pub fn delete_contact(&self, id: &str) -> Result<(), String> {
        let conn = self.pool.get().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM contacts WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete contact: {}", e))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_db_crud() {
        let manager = SqliteConnectionManager::memory();
        let pool = Pool::new(manager).unwrap();
        let conn = pool.get().unwrap();

        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS vault_items (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                title TEXT,
                content TEXT,
                file_path TEXT,
                tags TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS contacts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                public_key TEXT NOT NULL UNIQUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            "#,
        )
        .unwrap();

        let db = DbManager { pool };

        // Test contacts
        let contact = db.save_contact("Alice", "PUBKEY::1234567890abcdef").unwrap();
        assert_eq!(contact.name, "Alice");
        assert_eq!(contact.public_key, "1234567890abcdef");

        let contacts = db.get_contacts().unwrap();
        assert_eq!(contacts.len(), 1);

        // Test vault item
        let item = VaultItem {
            id: "test-id-1".to_string(),
            r#type: "text".to_string(),
            title: Some("My Secret".to_string()),
            content: Some("Secret text content".to_string()),
            file_path: None,
            tags: Some("test, secret".to_string()),
            created_at: "2026-08-28 12:00:00".to_string(),
        };

        db.insert_vault_item(&item).unwrap();

        let items = db.get_vault_items(Some("Secret"), None).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, "test-id-1");

        db.update_vault_item_tags("test-id-1", "updated, tag").unwrap();
        let updated_items = db.get_vault_items(None, Some("updated")).unwrap();
        assert_eq!(updated_items.len(), 1);

        db.delete_vault_item("test-id-1").unwrap();
        let empty_items = db.get_vault_items(None, None).unwrap();
        assert_eq!(empty_items.len(), 0);
    }
}
