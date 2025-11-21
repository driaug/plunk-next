/**
 * Background Job: Contact Import Processor
 * Processes CSV contact imports with validation and batch processing
 */

import {type Job, Worker} from 'bullmq';
import {parse} from 'csv-parse/sync';

import {ContactService} from '../services/ContactService.js';
import {type ContactImportJobData, importQueue} from '../services/QueueService.js';

const MAX_ROWS = 10000;
const BATCH_SIZE = 100; // Process contacts in batches of 100

interface ImportResult {
  totalRows: number;
  successCount: number;
  createdCount: number;
  updatedCount: number;
  failureCount: number;
  errors: {row: number; email: string; error: string}[];
}

interface ContactRow {
  email: string;
  [key: string]: any;
}

export function createImportWorker() {
  const worker = new Worker<ContactImportJobData>(
    importQueue.name,
    async (job: Job<ContactImportJobData>) => {
      const {projectId, csvData, filename} = job.data;

      console.log(`[IMPORT-PROCESSOR] Processing import for project ${projectId} (${filename})`);

      const result: ImportResult = {
        totalRows: 0,
        successCount: 0,
        createdCount: 0,
        updatedCount: 0,
        failureCount: 0,
        errors: [],
      };

      try {
        // Decode base64 CSV data
        const csvContent = Buffer.from(csvData, 'base64').toString('utf-8');

        // Parse CSV
        const records = parse(csvContent, {
          columns: true, // Use first row as header
          skip_empty_lines: true,
          trim: true,
          relax_column_count: true, // Allow rows with different column counts
        }) as ContactRow[];

        result.totalRows = records.length;

        // Validate row count
        if (records.length === 0) {
          throw new Error('CSV file is empty');
        }

        if (records.length > MAX_ROWS) {
          throw new Error(`CSV file exceeds maximum allowed rows (${MAX_ROWS}). Found ${records.length} rows.`);
        }

        console.log(`[IMPORT-PROCESSOR] Parsed ${records.length} rows from CSV`);

        // Validate that 'email' column exists
        const firstRecord = records[0];
        if (firstRecord && typeof firstRecord === 'object' && !('email' in firstRecord)) {
          throw new Error('CSV must have an "email" column');
        }

        // Process contacts in batches
        for (let i = 0; i < records.length; i += BATCH_SIZE) {
          const batch = records.slice(i, Math.min(i + BATCH_SIZE, records.length));

          // Process batch sequentially (to avoid overwhelming the database)
          for (const [batchIndex, record] of batch.entries()) {
            const rowNumber = i + batchIndex + 2; // +2 for header row and 1-based index

            try {
              // Validate email
              const email = record.email?.trim();
              if (!email) {
                result.failureCount++;
                result.errors.push({
                  row: rowNumber,
                  email: '',
                  error: 'Email is required',
                });
                continue;
              }

              // Basic email validation
              if (!isValidEmail(email)) {
                result.failureCount++;
                result.errors.push({
                  row: rowNumber,
                  email,
                  error: 'Invalid email format',
                });
                continue;
              }

              // Extract custom data (all fields except email)
              const {email: _, ...customData} = record;
              const data = Object.keys(customData).length > 0 ? customData : undefined;

              // Check if contact exists before upserting
              const existingContact = await ContactService.findByEmail(projectId, email);
              const isUpdate = !!existingContact;

              // Upsert contact
              await ContactService.upsert(projectId, email, data, true);

              result.successCount++;
              if (isUpdate) {
                result.updatedCount++;
              } else {
                result.createdCount++;
              }
            } catch (error) {
              result.failureCount++;
              result.errors.push({
                row: rowNumber,
                email: record.email || '',
                error: error instanceof Error ? error.message : 'Unknown error',
              });
            }
          }

          // Update progress
          const progress = Math.round(((i + batch.length) / records.length) * 100);
          await job.updateProgress(progress);

          console.log(`[IMPORT-PROCESSOR] Progress: ${progress}% (${i + batch.length}/${records.length})`);
        }

        console.log(
          `[IMPORT-PROCESSOR] Import completed: ${result.createdCount} created, ${result.updatedCount} updated, ${result.failureCount} failed`,
        );

        return result;
      } catch (error) {
        console.error(`[IMPORT-PROCESSOR] Failed to process import:`, error);

        // Return partial results with error
        result.errors.push({
          row: 0,
          email: '',
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error; // Re-throw to mark job as failed
      }
    },
    {
      connection: importQueue.opts.connection,
      concurrency: 2, // Process max 2 imports concurrently
    },
  );

  worker.on('completed', job => {
    console.log(`[IMPORT-PROCESSOR] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[IMPORT-PROCESSOR] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', err => {
    console.error('[IMPORT-PROCESSOR] Worker error:', err);
  });

  return worker;
}

/**
 * Basic email validation
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
