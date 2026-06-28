"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("prisma/config");
require("dotenv/config");
exports.default = (0, config_1.defineConfig)({
    schema: 'prisma/schema.prisma',
    datasource: {
        url: process.env.DATABASE_URL,
    },
    migrations: {
        seed: 'ts-node-esm prisma/seed.ts',
    },
});
//# sourceMappingURL=prisma.config.js.map