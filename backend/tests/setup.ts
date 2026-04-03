import os from 'os';
import path from 'path';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const LOCAL_MONGO_URI = 'mongodb://127.0.0.1:27017';
const TEST_DB_NAME = process.env.TEST_MONGO_DB || `campusway-tests-${process.pid}-${Date.now()}`;

let mongoServer: MongoMemoryServer | null = null;
let ownsMongoServer = false;

async function canConnectToMongo(uri: string): Promise<boolean> {
    let probeConnection: mongoose.Connection | null = null;
    try {
        probeConnection = await mongoose
            .createConnection(uri, {
                dbName: 'admin',
                directConnection: true,
                serverSelectionTimeoutMS: 1500,
            })
            .asPromise();
        if (!probeConnection.db) {
            return false;
        }
        await probeConnection.db.admin().command({ ping: 1 });
        return true;
    } catch {
        return false;
    } finally {
        if (probeConnection) {
            await probeConnection.close().catch(() => undefined);
        }
    }
}

async function resolveMongoUri(): Promise<string> {
    const explicitUri = process.env.TEST_MONGO_URI || process.env.MONGODB_URI || process.env.MONGO_URI;
    if (explicitUri) {
        return explicitUri;
    }

    if (await canConnectToMongo(LOCAL_MONGO_URI)) {
        return LOCAL_MONGO_URI;
    }

    process.env.MONGOMS_DOWNLOAD_DIR =
        process.env.MONGOMS_DOWNLOAD_DIR || path.join(os.homedir(), '.cache', 'mongodb-binaries');

    mongoServer = await MongoMemoryServer.create({
        binary: {
            downloadDir: process.env.MONGOMS_DOWNLOAD_DIR,
        },
        instance: {
            dbName: TEST_DB_NAME,
        },
    });
    ownsMongoServer = true;
    return mongoServer.getUri();
}

beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';

    const mongoUri = await resolveMongoUri();
    process.env.MONGODB_URI = process.env.MONGODB_URI || mongoUri;
    process.env.MONGO_URI = process.env.MONGO_URI || mongoUri;
    await mongoose.connect(mongoUri, {
        dbName: TEST_DB_NAME,
    });
});

afterEach(async () => {
    const collections = mongoose.connection.collections;
    const cleanupPromises: Promise<unknown>[] = [];
    for (const key of Object.keys(collections)) {
        cleanupPromises.push(collections[key].deleteMany({}));
    }
    await Promise.all(cleanupPromises);
});

afterAll(async () => {
    if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
        await mongoose.connection.db.dropDatabase();
    }
    await mongoose.disconnect();
    if (ownsMongoServer && mongoServer) {
        await mongoServer.stop();
    }
});
