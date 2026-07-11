import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client.js'

const connectionString = `${process.env.DATABASE_URL}`

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined
}

let prisma: PrismaClient

if (process.env.NODE_ENV === 'production') {
    const adapter = new PrismaPg({ connectionString })
    prisma = new PrismaClient({ adapter })
}
else {
    if (!globalForPrisma.prisma) {
        const adapter = new PrismaPg({ connectionString })
        globalForPrisma.prisma = new PrismaClient({ adapter })
    }
    prisma = globalForPrisma.prisma
}

export { prisma }
