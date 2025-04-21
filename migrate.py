import sqlite3

conn = sqlite3.connect("dreams.db")
c = conn.cursor()

# Helper: add column if not exists
def safe_add_column(column_def):
    try:
        c.execute(f"ALTER TABLE dreams ADD COLUMN {column_def}")
        print(f"Added column: {column_def}")
    except sqlite3.OperationalError as e:
        print(f"Skipping column '{column_def}':", e)

safe_add_column("timestamp TEXT")
safe_add_column("location TEXT")

conn.commit()
conn.close()
