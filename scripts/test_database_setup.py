"""Exercise fresh/repeated shared-database setup without any provider calls.

Requires psql, pnpm, uv, installed workspaces, and an explicit loopback
DATABASE_SETUP_ADMIN_URL whose user can create disposable databases.
"""

import json
import os
import re
import subprocess
import unittest
import uuid
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
PROVIDER_ENV = (
    "GROQ_API_KEY", "OPENAI_API_KEY", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT",
    "AZURE_DI_ENDPOINT", "AZURE_DI_KEY", "AZURE_SEARCH_ENDPOINT", "AZURE_SEARCH_KEY",
    "AUTH0_DOMAIN", "AUTH0_AUDIENCE", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN",
    "OTEL_EXPORTER_OTLP_ENDPOINT",
)


class DatabaseSetupTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        admin = os.environ.get("DATABASE_SETUP_ADMIN_URL", "")
        cls.url = urlsplit(admin)
        if cls.url.scheme != "postgresql" or cls.url.hostname not in {"127.0.0.1", "localhost", "::1"}:
            raise ValueError("DATABASE_SETUP_ADMIN_URL must explicitly name a loopback PostgreSQL server")
        if cls.url.query or cls.url.fragment:
            raise ValueError("Use a plain PostgreSQL URL without query parameters")
        cls.env = {key: value for key, value in os.environ.items() if not key.startswith(("AZURE_", "AUTH0_", "OPENAI_", "GROQ_", "UPSTASH_", "OTEL_"))}
        cls.env.update({key: "" for key in PROVIDER_ENV})
        cls.env.update(OPENAI_PROVIDER="openai", ENVIRONMENT="test", NEXT_TELEMETRY_DISABLED="1", TURBO_TELEMETRY_DISABLED="1")
        cls.env.update(PGHOST=cls.url.hostname, PGPORT=str(cls.url.port or 5432),
                       PGUSER=unquote(cls.url.username or "postgres"),
                       PGPASSWORD=unquote(cls.url.password or ""))

    def run_command(self, command, cwd=ROOT, env=None):
        result = subprocess.run(command, cwd=cwd, env=env or self.env, text=True,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=180)
        output = re.sub(r"postgres(?:ql)?://[^\s]+", "postgresql://[redacted]", result.stdout)
        self.assertEqual(result.returncode, 0, f"{command[0]} failed:\n{output[-4000:]}")
        return output.strip()

    def sql(self, statement, database):
        return self.run_command(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-A", "-t",
                                 "-d", database, "-c", statement])

    def setUp(self):
        self.database = "css_setup_" + uuid.uuid4().hex[:16]
        self.sql(f'CREATE DATABASE "{self.database}"', unquote(self.url.path.lstrip("/") or "postgres"))
        self.addCleanup(self.drop_database)
        self.test_env = dict(self.env, DATABASE_URL=urlunsplit(self.url._replace(path="/" + quote(self.database))))
        self.plain_url = self.test_env["DATABASE_URL"]

    def drop_database(self):
        assert re.fullmatch(r"css_setup_[0-9a-f]{16}", self.database)
        self.sql(f'DROP DATABASE "{self.database}" WITH (FORCE)', unquote(self.url.path.lstrip("/") or "postgres"))

    def prisma_deploy(self):
        self.run_command(["pnpm", "--filter", "@repo/database", "db:migrate:deploy"], env=self.test_env)

    def alembic_upgrade(self):
        self.run_command(["uv", "run", "--frozen", "alembic", "upgrade", "head"],
                         ROOT / "apps/aiml-service", self.test_env)

    def fixture(self):
        vector = "[" + ",".join(["1"] + ["0"] * 1535) + "]"
        self.sql(f"""INSERT INTO public.aiml_documents (id,text,metadata,embedding)
            VALUES ('00000000-0000-0000-0000-000000000001','preserve this vector','{{}}','{vector}'::vector);
            INSERT INTO support_app."User" (id,email,"updatedAt") VALUES ('setup-user','setup@example.invalid',now());
            INSERT INTO support_app."Order" (id,"userId","orderNumber",status,items,"totalAmount","updatedAt")
            VALUES ('setup-order','setup-user','ORD-SETUP-001','pending','[]',1.23,now());
            INSERT INTO support_app."Payment" (id,"userId","invoiceNumber",amount,status,method,"updatedAt")
            VALUES ('setup-payment','setup-user','INV-SETUP-001',1.23,'completed','credit_card',now());""", self.database)

    def state(self):
        return json.loads(self.sql("""SELECT json_build_object(
            'vector',md5(embedding::text),'dimensions',vector_dims(embedding),
            'alembic',(SELECT version_num FROM public.alembic_version),
            'prisma_schema',(SELECT schemaname FROM pg_tables WHERE tablename='_prisma_migrations'),
            'alembic_schema',(SELECT schemaname FROM pg_tables WHERE tablename='alembic_version'),
            'users',(SELECT count(*) FROM support_app."User"),
            'order',(SELECT row_to_json(o) FROM support_app."Order" o WHERE id='setup-order'),
            'payment',(SELECT row_to_json(p) FROM support_app."Payment" p WHERE id='setup-payment'))
            FROM public.aiml_documents WHERE id='00000000-0000-0000-0000-000000000001'""", self.database))

    def lookup_tools(self):
        self.run_command(["uv", "run", "--frozen", "python", "-c", """
import asyncio
from app.db.session import dispose_engine
from app.services.tools.order import LookupOrderArgs, LookupOrderTool
from app.services.tools.payment import LookupPaymentArgs, LookupPaymentTool
async def check():
    try:
        order = await LookupOrderTool().run(LookupOrderArgs(orderNumber='ORD-SETUP-001'))
        payment = await LookupPaymentTool().run(LookupPaymentArgs(invoiceNumber='INV-SETUP-001'))
        assert order.orderNumber == 'ORD-SETUP-001' and order.totalAmount == 1.23
        assert payment.invoiceNumber == 'INV-SETUP-001' and payment.amount == 1.23
    finally:
        await dispose_engine()
asyncio.run(check())
"""], ROOT / "apps/aiml-service", self.test_env)

    def prisma_client_lookup(self):
        self.run_command(["node", "--input-type=module", "-e", """
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
try {
    const user = await db.user.findUnique({ where: { id: 'setup-user' } });
    const order = await db.order.findUnique({ where: { id: 'setup-order' } });
    const payment = await db.payment.findUnique({ where: { id: 'setup-payment' } });
    if (user?.email !== 'setup@example.invalid' || order?.orderNumber !== 'ORD-SETUP-001' || payment?.invoiceNumber !== 'INV-SETUP-001') {
        throw new Error('Prisma client did not read the shared fixture');
    }
} finally {
    await db.$disconnect();
}
"""], env=self.test_env)

    def exercise(self, prisma_first):
        steps = (self.prisma_deploy, self.alembic_upgrade) if prisma_first else (self.alembic_upgrade, self.prisma_deploy)
        for step in steps:
            step()
        self.fixture()
        before = self.state()
        self.assertEqual(before["dimensions"], 1536)
        self.assertEqual(before["alembic"], "0002_agents_tooluse")
        self.assertEqual(before["prisma_schema"], "support_app")
        self.assertEqual(before["alembic_schema"], "public")
        for _ in range(2):
            for step in steps:
                step()
            self.run_command(["pnpm", "db:push"], env=self.test_env)
            self.assertEqual(self.state(), before)
            self.assertEqual(self.test_env["DATABASE_URL"], self.plain_url)
            self.assertEqual(urlsplit(self.plain_url).query, "")
            self.prisma_client_lookup()
            self.lookup_tools()

    def test_prisma_then_alembic(self):
        self.exercise(prisma_first=True)

    def test_alembic_then_prisma(self):
        self.exercise(prisma_first=False)


if __name__ == "__main__":
    unittest.main(verbosity=2)
