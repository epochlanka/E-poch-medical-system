import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class AppointmentsService {
  /**
   * Create a new appointment
   */
  async createAppointment(data: { patient_id: string; doctor_id: number; scheduled_at: Date; created_by: number }) {
    return prisma.appointment.create({
      data: {
        patient_id: data.patient_id,
        doctor_id: data.doctor_id,
        scheduled_at: data.scheduled_at,
        created_by: data.created_by,
        status: 'Waiting',
      },
      include: {
        patient: {
          select: {
            full_name: true,
            gender: true,
            dob: true,
            phone: true,
          }
        },
        doctor: {
          select: {
            username: true
          }
        }
      }
    });
  }

  /**
   * Fetch the live queue for today
   */
  async getLiveQueue() {
    // For today's queue, we typically want anything that isn't Completed/Skipped, 
    // or maybe just specific statuses, and only for today's date.
    // For simplicity in testing, we'll fetch all active queue items.
    return prisma.appointment.findMany({
      where: {
        status: {
          in: ['Waiting', 'Called', 'Consulting']
        }
      },
      include: {
        patient: {
          select: {
            full_name: true,
            gender: true,
            dob: true,
          }
        },
        doctor: {
          select: {
            username: true
          }
        }
      },
      orderBy: {
        scheduled_at: 'asc'
      }
    });
  }

  /**
   * Fetch all active doctors (for dropdown autocomplete)
   */
  async getDoctors(search?: string) {
    const where: any = { role: 'Doctor', is_active: true };
    if (search) {
      where.username = { contains: search };
    }
    
    return prisma.user.findMany({
      where,
      select: {
        user_id: true,
        username: true,
        registration_number: true
      },
      orderBy: { username: 'asc' },
      take: 20
    });
  }

  /**
   * Fetch all appointments (with optional filters)
   */
  async getAllAppointments(filters?: { date?: Date; doctor_id?: number; status?: string }) {
    const where: any = {};
    if (filters?.doctor_id) where.doctor_id = filters.doctor_id;
    if (filters?.status) where.status = filters.status;
    
    return prisma.appointment.findMany({
      where,
      include: {
        patient: {
          select: {
            full_name: true,
            gender: true
          }
        },
        doctor: {
          select: {
            username: true
          }
        }
      },
      orderBy: {
        scheduled_at: 'desc'
      }
    });
  }

  /**
   * Update appointment status
   */
  async updateStatus(appointment_id: number, status: string) {
    return prisma.appointment.update({
      where: { appointment_id },
      data: { status },
      include: {
        patient: {
          select: {
            full_name: true,
            gender: true,
            dob: true,
          }
        },
        doctor: {
          select: {
            username: true
          }
        }
      }
    });
  }

  /**
   * Update appointment time
   */
  async updateTime(appointment_id: number, scheduled_at: Date) {
    return prisma.appointment.update({
      where: { appointment_id },
      data: { scheduled_at },
      include: {
        patient: {
          select: {
            full_name: true,
            gender: true,
            dob: true,
          }
        },
        doctor: {
          select: {
            username: true
          }
        }
      }
    });
  }
}

export const appointmentsService = new AppointmentsService();
