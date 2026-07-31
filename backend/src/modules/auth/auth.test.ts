import request from 'supertest';
import app from '../../app';

describe('Auth API', () => {
  it('should fail login with invalid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'wrongpassword' });
    
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid username or password');
  });

  it('should succeed login with valid credentials', async () => {
    // Note: The database must be seeded with the admin user for this to pass
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('username', 'admin');
    expect(res.body.user).toHaveProperty('role', 'Admin');
  });

  it('should return 400 for missing fields', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin' });
    
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });
});
