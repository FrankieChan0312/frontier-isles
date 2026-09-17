/** Constant identifiers only. DDL is deliberately explicit, never an automatic repair. */
export const MYSQL_SCHEMA_SQL: readonly string[] = [
  `CREATE TABLE persistence_schema (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    version INT UNSIGNED NOT NULL
  ) ENGINE=InnoDB`,
  `CREATE TABLE rooms (
    room_code VARBINARY(6) NOT NULL PRIMARY KEY,
    revision BIGINT UNSIGNED NOT NULL,
    incarnation BINARY(16) NOT NULL,
    payload MEDIUMBLOB NOT NULL,
    checksum BINARY(64) NOT NULL
  ) ENGINE=InnoDB`,
  `CREATE TABLE quarantine (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    room_code VARBINARY(6) NOT NULL,
    revision BIGINT UNSIGNED NOT NULL,
    incarnation BINARY(16) NOT NULL,
    payload MEDIUMBLOB NOT NULL,
    checksum BINARY(64) NOT NULL,
    reason VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL
  ) ENGINE=InnoDB`,
]

export const MYSQL_COLUMNS: readonly string[] = [
  'persistence_schema:id:tinyint unsigned:NO:PRI:',
  'persistence_schema:version:int unsigned:NO::',
  'quarantine:id:bigint unsigned:NO:PRI:auto_increment',
  'quarantine:room_code:varbinary(6):NO::',
  'quarantine:revision:bigint unsigned:NO::',
  'quarantine:incarnation:binary(16):NO::',
  'quarantine:payload:mediumblob:NO::',
  'quarantine:checksum:binary(64):NO::',
  'quarantine:reason:varchar(32):NO::',
  'rooms:room_code:varbinary(6):NO:PRI:',
  'rooms:revision:bigint unsigned:NO::',
  'rooms:incarnation:binary(16):NO::',
  'rooms:payload:mediumblob:NO::',
  'rooms:checksum:binary(64):NO::',
]
