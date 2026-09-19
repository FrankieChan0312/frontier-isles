import { beforeEach } from 'vitest'
import { MysqlMultiplayerRepository } from '../src/persistence/mysql-multiplayer-repository.js'
import { defineRecoveryContract } from './recovery-contract.js'
import { mysqlTestConfig, resetMysqlTestSchema } from './mysql-test-helpers.js'

beforeEach(resetMysqlTestSchema)
defineRecoveryContract(() => ({ open: async () => (await MysqlMultiplayerRepository.open(mysqlTestConfig())), remove: () => {} }))
