-- CreateTable
CREATE TABLE "AppointmentQueueLog" (
    "log_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "appointment_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "actor_id" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppointmentQueueLog_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "Appointment" ("appointment_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AppointmentQueueLog_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AppointmentQueueLog_appointment_id_created_at_idx" ON "AppointmentQueueLog"("appointment_id", "created_at");
