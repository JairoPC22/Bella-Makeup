import dotenv from "dotenv";
import path from "path";

// Load .env file
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export default {
  datasource: {
    url: process.env.DATABASE_URL,
  },
};
