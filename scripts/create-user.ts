/**
 * Standalone script: creates (or updates) a user record.
 *
 * Usage:
 *   bunx tsx scripts/create-user.ts <email> <password>
 *
 * If the email already exists, the password is updated in-place.
 */
import { db } from '../src/lib/db'
import { genId, hashPassword } from '../src/lib/auth'

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase()
  const password = process.argv[3] || ''

  if (!email || !password) {
    console.error('Usage: bunx tsx scripts/create-user.ts <email> <password>')
    process.exit(1)
  }

  const passwordHash = hashPassword(password)
  const createdAt = new Date().toISOString()

  const existing = await db.user.findUnique({ where: { email } })

  if (existing) {
    await db.user.update({
      where: { id: existing.id },
      data: { passwordHash },
    })
    console.log(`Updated password for existing user: ${email} (id: ${existing.id})`)
  } else {
    const id = genId()
    await db.user.create({
      data: { id, email, passwordHash, createdAt },
    })
    console.log(`Created user: ${email} (id: ${id})`)
  }

  await db.$disconnect()
}

main().catch((err) => {
  console.error('Failed to create user:', err)
  process.exit(1)
})
