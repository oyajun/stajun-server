// テスト実行前に .env を process.env へ読み込む（lib/prisma が import 時に
// DATABASE_URL を参照するため、テストモジュールより先に実行される必要がある）
import "dotenv/config";
