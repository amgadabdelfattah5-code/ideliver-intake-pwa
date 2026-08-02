import type { StaffRole } from './auth';
import { verifyPassword } from './crypto';

interface LocalPwaAccount {
  username: string;
  displayName: string;
  email: string;
  role: StaffRole;
  wpUserId: number;
  salt: string;
  passwordHash: string;
}

const localAccounts: LocalPwaAccount[] = [
  {
    username: 'hamoo',
    displayName: 'Hamoo',
    email: 'hamoo@ideliver.local',
    role: 'admin',
    wpUserId: -101,
    salt: 'a7769eff749be57495c380e12d9045d2',
    passwordHash: 'ff2552f7728516efc9f1fe319f9e0f901c05af72b19fd2fe9750df5080d996de',
  },
  {
    username: 'karma',
    displayName: 'Karma',
    email: 'karma@ideliver.local',
    role: 'data_entry',
    wpUserId: -102,
    salt: 'e9964a4d313c9d5dd198e4b8166177b0',
    passwordHash: '8814659f1249b8da25ea301df95ebc40bbdc8ab37d8405aba8af2d4ff8c631f9',
  },
  {
    username: 'testdrive',
    displayName: 'Test Driver',
    email: 'testdrive@ideliver.local',
    role: 'driver',
    wpUserId: -201,
    salt: '2521701e5dcd1258bc5d0c285c8845de',
    passwordHash: '794f3ddd76db49eb1cc2e359b1eab3c10257cfef91249a321909d38fef54d2f7',
  },
];

export async function verifyLocalPwaAccount(username: string, password: string) {
  const normalizedUsername = username.trim().toLowerCase();
  const account = localAccounts.find((item) => item.username === normalizedUsername);

  if (!account || !await verifyPassword(password, account.passwordHash, account.salt)) return null;

  return {
    wpUserId: account.wpUserId,
    username: account.displayName,
    email: account.email,
    role: account.role,
    isAdmin: account.role === 'admin',
    permissions: account.role === 'driver'
      ? ['driver']
      : account.role === 'admin'
        ? []
        : ['capture', 'review', 'print'],
    authProvider: 'local' as const,
  };
}
