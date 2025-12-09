import Fastify from 'fastify';
import cors from '@fastify/cors';

const fastify = Fastify({
    logger: true,
});

fastify.register(cors, {
    origin: true,
    credentials: true,
    allowedHeaders: ['Authorization', 'X-Proxy-Target-Url', 'Content-Type']
});

fastify.get('/api/test', async (request, reply) => {
    const authHeader = request.headers['authorization'];
    console.log(`[DummyBackend] ${request.method} ${request.url} Auth: ${authHeader}`);

    if (authHeader === 'Bearer REAL_API_KEY') {
        return { message: 'Success', authorized: true };
    }

    return { message: 'Unauthorized', authorized: false };
});

fastify.get('/api/echo', async (request, reply) => {
    return {
        headers: request.headers,
        url: request.url
    };
});

const start = async () => {
    const port = parseInt(process.env.PORT || '9999', 10);
    try {
        await fastify.listen({ port, host: '0.0.0.0' });
        console.log(`Dummy Backend listening on ${port}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
