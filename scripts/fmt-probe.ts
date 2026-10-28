import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const u = await db.user.create({
    data: {
      username: "__fmt_probe__",
      passwordHash: "x:y",
      mutedUntil: new Date(Date.now() + 60000),
      lastClaimAt: new Date(),
    },
  });
  await db.session.create({
    data: {
      token: "fmtprobe123",
      userId: u.id,
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  console.log("cuid sample:", u.id);
  const { Database } = await import("bun:sqlite");
  const raw = new Database("/home/z/my-project/db/custom.db");
  console.log("user row:", JSON.stringify(raw.query("SELECT id, username, mutedUntil, lastClaimAt, coins, role FROM User WHERE id = ?").get(u.id)));
  console.log("session row:", JSON.stringify(raw.query("SELECT token, userId, expiresAt, createdAt FROM Session WHERE token = ?").get("fmtprobe123")));
  console.log("channel cols:", JSON.stringify(raw.query("PRAGMA table_info(Channel)").all().map((c: any) => c.name + ":" + c.type)));
  console.log("message cols:", JSON.stringify(raw.query("PRAGMA table_info(Message)").all().map((c: any) => c.name + ":" + c.type)));
  console.log("chatsettings cols:", JSON.stringify(raw.query("PRAGMA table_info(ChatSettings)").all().map((c: any) => c.name + ":" + c.type)));
  await db.session.delete({ where: { token: "fmtprobe123" } });
  await db.user.delete({ where: { id: u.id } });
  raw.close();
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
