import os
import mysql.connector
from mysql.connector import errorcode
from dotenv import load_dotenv

load_dotenv("db.env")

def get_connection():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST"),
        port=int(os.getenv("DB_PORT")),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
    )

try:
    conn = get_connection()

    if conn.is_connected():
        print ("Connected to MySQL")

        cursor = conn.cursor()

        cursor.execute("show tables;")

        rows = cursor.fetchall()

        for row in rows:
            print(row)
        
        cursor.close()
        conn.close()
        
except mysql.connector.Error as err:
    if err.errno == errorcode.ER_ACCESS_DENIED_ERROR:
        print("Something is wrong with your credentials")
    elif err.errno == errorcode.ER_BAD_DB_ERROR:
        print("Database does not exist")
    else:
        print(err)
else:
    conn.close()