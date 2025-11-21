import {type Contact, Prisma} from '@repo/db';

import {prisma} from '../database/prisma.js';
import {HttpException} from '../exceptions/index.js';

export interface PaginatedContacts {
  contacts: Contact[];
  total: number;
  cursor?: string;
  hasMore: boolean;
}

export class ContactService {
  /**
   * Get all contacts for a project with cursor-based pagination
   * Uses cursor pagination for better performance with large datasets
   */
  public static async list(
    projectId: string,
    limit = 20,
    cursor?: string,
    search?: string,
  ): Promise<PaginatedContacts> {
    const where: Prisma.ContactWhereInput = {
      projectId,
      ...(search
        ? {
            email: {
              contains: search,
              mode: 'insensitive' as const,
            },
          }
        : {}),
    };

    // Fetch one extra to determine if there are more results
    const contacts = await prisma.contact.findMany({
      where,
      take: limit + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? {id: cursor} : undefined,
      orderBy: {createdAt: 'desc'},
    });

    const hasMore = contacts.length > limit;
    const results = hasMore ? contacts.slice(0, -1) : contacts;
    const nextCursor = hasMore ? results[results.length - 1]?.id : undefined;

    // Get total count only on first page for better performance
    const total = !cursor ? await prisma.contact.count({where}) : 0;

    return {
      contacts: results,
      total,
      cursor: nextCursor,
      hasMore,
    };
  }

  /**
   * Get a single contact by ID
   */
  public static async get(projectId: string, contactId: string): Promise<Contact> {
    const contact = await prisma.contact.findFirst({
      where: {
        id: contactId,
        projectId,
      },
    });

    if (!contact) {
      throw new HttpException(404, 'Contact not found');
    }

    return contact;
  }

  /**
   * Find a contact by email (returns null if not found)
   */
  public static async findByEmail(projectId: string, email: string): Promise<Contact | null> {
    return prisma.contact.findFirst({
      where: {
        projectId,
        email,
      },
    });
  }

  /**
   * Create a new contact
   * Uses unique constraint violation to check for duplicates (more efficient)
   */
  public static async create(
    projectId: string,
    data: {email: string; data?: Prisma.JsonValue; subscribed?: boolean},
  ): Promise<Contact> {
    try {
      return await prisma.contact.create({
        data: {
          projectId,
          email: data.email,
          data: data.data ?? Prisma.JsonNull,
          subscribed: data.subscribed ?? true,
        },
      });
    } catch (error) {
      // Check if this is a unique constraint violation (P2002)
      if (error instanceof Error && 'code' in error && error.code === 'P2002') {
        throw new HttpException(409, 'Contact with this email already exists in this project');
      }
      throw error;
    }
  }

  /**
   * Update a contact
   * Uses unique constraint violation to check for duplicates (more efficient)
   */
  public static async update(
    projectId: string,
    contactId: string,
    data: {email?: string; data?: Prisma.JsonValue; subscribed?: boolean},
  ): Promise<Contact> {
    // First verify contact exists and belongs to project
    await this.get(projectId, contactId);

    const updateData: Prisma.ContactUpdateInput = {};

    if (data.email !== undefined) {
      updateData.email = data.email;
    }
    if (data.data !== undefined) {
      updateData.data = data.data === null ? Prisma.JsonNull : data.data;
    }
    if (data.subscribed !== undefined) {
      updateData.subscribed = data.subscribed;
    }

    try {
      return await prisma.contact.update({
        where: {id: contactId},
        data: updateData,
      });
    } catch (error) {
      // Check if this is a unique constraint violation (P2002)
      if (error instanceof Error && 'code' in error && error.code === 'P2002') {
        throw new HttpException(409, 'Contact with this email already exists in this project');
      }
      throw error;
    }
  }

  /**
   * Delete a contact
   */
  public static async delete(projectId: string, contactId: string): Promise<void> {
    // First verify contact exists and belongs to project
    await this.get(projectId, contactId);

    await prisma.contact.delete({
      where: {id: contactId},
    });
  }

  /**
   * Get contact count for a project
   */
  public static async count(projectId: string): Promise<number> {
    return prisma.contact.count({
      where: {projectId},
    });
  }

  /**
   * Upsert a contact (create or update) with metadata merging
   * Supports persistent and non-persistent data fields
   * Reserved fields: plunk_id, plunk_email
   */
  public static async upsert(
    projectId: string,
    email: string,
    data?: Record<string, any>,
    subscribed?: boolean,
  ): Promise<Contact> {
    // Find existing contact
    const existing = await prisma.contact.findFirst({
      where: {
        projectId,
        email,
      },
    });

    // Process data to merge with existing data
    let mergedData: Record<string, any> = {};

    if (existing?.data && typeof existing.data === 'object') {
      // Start with existing data
      mergedData = {...(existing.data as Record<string, any>)};
    }

    // Merge new data (if provided)
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        // Skip reserved fields
        if (key === 'plunk_id' || key === 'plunk_email') {
          continue;
        }

        // Handle non-persistent data format: { value: "...", persistent: false }
        if (
          typeof value === 'object' &&
          value !== null &&
          'value' in value &&
          'persistent' in value &&
          value.persistent === false
        ) {
          // Non-persistent fields are not stored in contact data
          // They would be used only for the current operation (like email template rendering)
          continue;
        }

        // Store the value
        mergedData[key] = value;
      }
    }

    if (existing) {
      // Update existing contact
      return prisma.contact.update({
        where: {id: existing.id},
        data: {
          data: Object.keys(mergedData).length > 0 ? mergedData : Prisma.JsonNull,
          ...(subscribed !== undefined ? {subscribed} : {}),
        },
      });
    } else {
      // Create new contact
      return prisma.contact.create({
        data: {
          projectId,
          email,
          data: Object.keys(mergedData).length > 0 ? mergedData : Prisma.JsonNull,
          subscribed: subscribed ?? true,
        },
      });
    }
  }

  /**
   * Get the full merged data for a contact including non-persistent fields
   * This is useful for template rendering
   */
  public static getMergedData(contact: Contact, temporaryData?: Record<string, any>): Record<string, any> {
    const mergedData: Record<string, any> = {
      plunk_id: contact.id,
      plunk_email: contact.email,
    };

    // Add contact's persistent data
    if (contact.data && typeof contact.data === 'object') {
      Object.assign(mergedData, contact.data as Record<string, any>);
    }

    // Add temporary (non-persistent) data
    if (temporaryData) {
      for (const [key, value] of Object.entries(temporaryData)) {
        // Skip reserved fields
        if (key === 'plunk_id' || key === 'plunk_email') {
          continue;
        }

        // Handle non-persistent data format: { value: "...", persistent: false }
        if (
          typeof value === 'object' &&
          value !== null &&
          'value' in value &&
          'persistent' in value &&
          value.persistent === false
        ) {
          mergedData[key] = value.value;
        } else {
          mergedData[key] = value;
        }
      }
    }

    return mergedData;
  }

  /**
   * PUBLIC: Get a contact by ID (no project authentication required)
   * This is used for public-facing pages like unsubscribe
   */
  public static async getById(contactId: string): Promise<Contact> {
    const contact = await prisma.contact.findUnique({
      where: {id: contactId},
    });

    if (!contact) {
      throw new HttpException(404, 'Contact not found');
    }

    return contact;
  }

  /**
   * PUBLIC: Subscribe a contact
   */
  public static async subscribe(contactId: string): Promise<Contact> {
    const contact = await this.getById(contactId);

    return prisma.contact.update({
      where: {id: contactId},
      data: {subscribed: true},
    });
  }

  /**
   * PUBLIC: Unsubscribe a contact
   */
  public static async unsubscribe(contactId: string): Promise<Contact> {
    const contact = await this.getById(contactId);

    return prisma.contact.update({
      where: {id: contactId},
      data: {subscribed: false},
    });
  }

  /**
   * Get all available contact fields for a project
   * Returns both standard fields and custom fields from the data JSON column
   *
   * @param projectId - The project ID to filter contacts
   * @returns Array of field names (e.g., ["subscribed", "data.plan", "data.firstName"])
   */
  public static async getAvailableFields(projectId: string): Promise<string[]> {
    // Standard fields
    const standardFields = ['subscribed'];

    // Get custom fields from the data JSON column
    // Use raw SQL to extract all keys from the JSON data column
    const result = await prisma.$queryRaw<Array<{key: string}>>`
      SELECT DISTINCT jsonb_object_keys(data) as key
      FROM contacts
      WHERE
        "projectId" = ${projectId}
        AND data IS NOT NULL
        AND jsonb_typeof(data) = 'object'
    `;

    // Combine standard fields with custom fields (prefixed with "data.")
    const customFields = result.map(row => `data.${row.key}`);

    return [...standardFields, ...customFields].sort();
  }

  /**
   * Get unique values for a contact field
   * Optimized for large datasets (1M+ contacts) - limits results and uses efficient queries
   *
   * @param projectId - The project ID to filter contacts
   * @param field - The field path (e.g., "subscribed", "email", "data.plan", "data.firstName")
   * @param limit - Maximum number of unique values to return (default: 100)
   * @returns Array of unique values, sorted alphabetically
   */
  public static async getUniqueFieldValues(
    projectId: string,
    field: string,
    limit = 100,
  ): Promise<Array<string | number | boolean>> {
    // Handle standard fields vs JSON data fields
    if (field === 'subscribed') {
      // Boolean field - return both possible values
      return [true, false];
    }

    if (field === 'email') {
      // Email is not useful for dropdowns, return empty
      return [];
    }

    // Handle JSON data fields (e.g., "data.plan" or just "plan")
    const jsonField = field.startsWith('data.') ? field.substring(5) : field;

    // Use raw SQL for performance with large datasets
    // Extract unique values from the JSON field using PostgreSQL's JSON operators
    const result = await prisma.$queryRaw<Array<{value: any}>>`
      SELECT DISTINCT
        data->>${jsonField} as value
      FROM contacts
      WHERE
        "projectId" = ${projectId}
        AND data ? ${jsonField}
        AND data->>${jsonField} IS NOT NULL
        AND data->>${jsonField} != ''
      ORDER BY value
      LIMIT ${limit}
    `;

    // Parse and return values, handling different data types
    return result
      .map(row => {
        const value = row.value;

        // Try to parse as boolean
        if (value === 'true') return true;
        if (value === 'false') return false;

        // Try to parse as number
        const numValue = Number(value);
        if (!isNaN(numValue) && value.trim() !== '') {
          return numValue;
        }

        // Return as string
        return value;
      })
      .filter(v => v !== null && v !== undefined);
  }
}
