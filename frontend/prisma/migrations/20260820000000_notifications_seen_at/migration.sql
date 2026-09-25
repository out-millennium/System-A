-- Cross-device "bell last opened" timestamp. Additive + nullable.
ALTER TABLE "User" ADD COLUMN "notificationsSeenAt" TIMESTAMP(3);
