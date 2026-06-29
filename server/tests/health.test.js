const request = require('supertest');
const app = require('../app');

describe('GET /health', () => {
  it('should return 200 and ok:true when DB is connected', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.db.ping).toBe('ok');
  });
});

describe('GET /', () => {
  it('should return API is running message', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('API is running');
  });
});