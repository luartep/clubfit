import { pgTable, serial, text, varchar, timestamp, boolean, integer, date } from 'drizzle-orm/pg-core';

export const usuarios = pgTable('usuarios', {
  id: serial('id').primaryKey(),
  nombre: varchar('nombre', { length: 200 }).notNull(),
  rut: varchar('rut', { length: 12 }).notNull().unique(),
  email: varchar('email', { length: 200 }),
  telefono: varchar('telefono', { length: 20 }),
  foto: text('foto'), // base64 o URL
  fotoDescriptor: text('foto_descriptor'), // JSON de face-api descriptores
  planTipo: varchar('plan_tipo', { length: 50 }).notNull(), // mensual, trimestral, semestral, anual
  planInicio: date('plan_inicio').notNull(),
  planVencimiento: date('plan_vencimiento').notNull(),
  activo: boolean('activo').default(true),
  huellaId: text('huella_id'), // ID de credencial WebAuthn
  huellaCredencial: text('huella_credencial'), // JSON de credencial WebAuthn
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const asistencias = pgTable('asistencias', {
  id: serial('id').primaryKey(),
  usuarioId: integer('usuario_id').references(() => usuarios.id),
  metodo: varchar('metodo', { length: 20 }).notNull(), // facial, huella, manual
  timestamp: timestamp('timestamp').defaultNow(),
  exitoso: boolean('exitoso').default(true),
});

export type Usuario = typeof usuarios.$inferSelect;
export type NuevoUsuario = typeof usuarios.$inferInsert;
export type Asistencia = typeof asistencias.$inferSelect;
