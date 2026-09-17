import { beforeEach } from 'vitest'
import { MysqlStore } from '../src/persistence/mysql-store.js'
import { defineRecoveryContract } from './recovery-contract.js'
import { prepareRestrictedMysql, restrictedMysqlConfig } from './mysql-restricted-helpers.js'

beforeEach(prepareRestrictedMysql)
defineRecoveryContract(() => ({ open: () => MysqlStore.open(restrictedMysqlConfig()), remove: () => {} }))
