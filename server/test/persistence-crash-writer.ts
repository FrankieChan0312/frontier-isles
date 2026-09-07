import { DatabaseSync } from 'node:sqlite'

const filename = process.argv[2]
if (filename === undefined) throw new Error('A temporary test database is required.')
const database = new DatabaseSync(filename)
database.exec('PRAGMA cache_size=1; BEGIN IMMEDIATE')
database.prepare('UPDATE rooms SET payload=?').run('interrupted-write'.repeat(100_000))
process.send?.('TRANSACTION_OPEN')
// The parent intentionally kills this test-only writer before COMMIT.
setInterval(() => {}, 60_000)
