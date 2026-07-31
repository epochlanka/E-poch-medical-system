import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-replace-in-production';
const JWT_EXPIRES_IN = '1d';

export const loginUser = async (username: string, password: string) => {
  const user = await prisma.user.findUnique({
    where: { username },
  });

  if (!user || !user.is_active) {
    throw new Error('Invalid username or password');
  }

  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  
  if (!isPasswordValid) {
    throw new Error('Invalid username or password');
  }

  const payload = {
    sub: user.user_id,
    role: user.role,
    username: user.username,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  return {
    token,
    user: {
      id: user.user_id,
      username: user.username,
      role: user.role,
    }
  };
};
