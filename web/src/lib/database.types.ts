export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  accounts: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          member_id: string | null
          summary: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          member_id?: string | null
          summary?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          member_id?: string | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "activity_log_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          compression: string | null
          created_at: string
          entity_id: string
          entity_type: string
          file_name: string
          id: string
          mime_type: string | null
          original_size_bytes: number | null
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          compression?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          file_name: string
          id?: string
          mime_type?: string | null
          original_size_bytes?: number | null
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          compression?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          original_size_bytes?: number | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          account_id: string
          amount: number
          auto_matched: boolean
          balance_after: number | null
          created_at: string
          dedupe_hash: string
          description: string
          external_id: string | null
          id: string
          import_batch: string | null
          matched_expense_id: string | null
          matched_income_id: string | null
          matched_payment_id: string | null
          matched_transfer_id: string | null
          note: string | null
          posted_on: string
          reviewed_at: string | null
          reviewed_by: string | null
          rule_id: string | null
          source: string
          status: Database["accounts"]["Enums"]["bank_txn_status"]
        }
        Insert: {
          account_id: string
          amount: number
          auto_matched?: boolean
          balance_after?: number | null
          created_at?: string
          dedupe_hash: string
          description: string
          external_id?: string | null
          id?: string
          import_batch?: string | null
          matched_expense_id?: string | null
          matched_income_id?: string | null
          matched_payment_id?: string | null
          matched_transfer_id?: string | null
          note?: string | null
          posted_on: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_id?: string | null
          source?: string
          status?: Database["accounts"]["Enums"]["bank_txn_status"]
        }
        Update: {
          account_id?: string
          amount?: number
          auto_matched?: boolean
          balance_after?: number | null
          created_at?: string
          dedupe_hash?: string
          description?: string
          external_id?: string | null
          id?: string
          import_batch?: string | null
          matched_expense_id?: string | null
          matched_income_id?: string | null
          matched_payment_id?: string | null
          matched_transfer_id?: string | null
          note?: string | null
          posted_on?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_id?: string | null
          source?: string
          status?: Database["accounts"]["Enums"]["bank_txn_status"]
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "money_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_expense_id_fkey"
            columns: ["matched_expense_id"]
            isOneToOne: false
            referencedRelation: "expense_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_expense_id_fkey"
            columns: ["matched_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_income_id_fkey"
            columns: ["matched_income_id"]
            isOneToOne: false
            referencedRelation: "other_income"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_payment_id_fkey"
            columns: ["matched_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_transfer_id_fkey"
            columns: ["matched_transfer_id"]
            isOneToOne: false
            referencedRelation: "member_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "bank_transactions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_txn_batch_fk"
            columns: ["import_batch"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      business_profile: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          bank_details: string | null
          base_currency: string
          bc_incorporation_number: string | null
          business_number: string | null
          city: string | null
          country: string
          credit_note_prefix: string
          default_tax_code: string
          default_terms_days: number
          email: string | null
          estimate_prefix: string
          estimate_valid_days: number
          etransfer_email: string | null
          fiscal_year_end: string
          gst_filing_period: string
          gst_number: string | null
          gst_quick_method: boolean
          gst_registered_on: string | null
          id: boolean
          incorporated_on: string | null
          invoice_accent: string
          invoice_footer: string | null
          invoice_prefix: string
          invoice_show_logo: boolean
          invoice_thank_you: string | null
          invoice_theme: string
          legal_name: string
          lock_books_before: string | null
          logo_path: string | null
          mileage_rate: number
          mileage_rate_after_5000: number
          next_estimate_seq: number
          next_invoice_seq: number
          operating_name: string | null
          payment_instructions: string | null
          phone: string | null
          postal_code: string | null
          province: string
          receipt_required_over: number
          shareholder_loan_alert_days: number
          timezone: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          bank_details?: string | null
          base_currency?: string
          bc_incorporation_number?: string | null
          business_number?: string | null
          city?: string | null
          country?: string
          credit_note_prefix?: string
          default_tax_code?: string
          default_terms_days?: number
          email?: string | null
          estimate_prefix?: string
          estimate_valid_days?: number
          etransfer_email?: string | null
          fiscal_year_end?: string
          gst_filing_period?: string
          gst_number?: string | null
          gst_quick_method?: boolean
          gst_registered_on?: string | null
          id?: boolean
          incorporated_on?: string | null
          invoice_accent?: string
          invoice_footer?: string | null
          invoice_prefix?: string
          invoice_show_logo?: boolean
          invoice_thank_you?: string | null
          invoice_theme?: string
          legal_name: string
          lock_books_before?: string | null
          logo_path?: string | null
          mileage_rate?: number
          mileage_rate_after_5000?: number
          next_estimate_seq?: number
          next_invoice_seq?: number
          operating_name?: string | null
          payment_instructions?: string | null
          phone?: string | null
          postal_code?: string | null
          province?: string
          receipt_required_over?: number
          shareholder_loan_alert_days?: number
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          bank_details?: string | null
          base_currency?: string
          bc_incorporation_number?: string | null
          business_number?: string | null
          city?: string | null
          country?: string
          credit_note_prefix?: string
          default_tax_code?: string
          default_terms_days?: number
          email?: string | null
          estimate_prefix?: string
          estimate_valid_days?: number
          etransfer_email?: string | null
          fiscal_year_end?: string
          gst_filing_period?: string
          gst_number?: string | null
          gst_quick_method?: boolean
          gst_registered_on?: string | null
          id?: boolean
          incorporated_on?: string | null
          invoice_accent?: string
          invoice_footer?: string | null
          invoice_prefix?: string
          invoice_show_logo?: boolean
          invoice_thank_you?: string | null
          invoice_theme?: string
          legal_name?: string
          lock_books_before?: string | null
          logo_path?: string | null
          mileage_rate?: number
          mileage_rate_after_5000?: number
          next_estimate_seq?: number
          next_invoice_seq?: number
          operating_name?: string | null
          payment_instructions?: string | null
          phone?: string | null
          postal_code?: string | null
          province?: string
          receipt_required_over?: number
          shareholder_loan_alert_days?: number
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          archived: boolean
          cca_class: string | null
          color: string | null
          deductible_pct: number
          gifi_code: string | null
          icon: string | null
          id: string
          is_capital: boolean
          kind: string
          name: string
          sort: number
        }
        Insert: {
          archived?: boolean
          cca_class?: string | null
          color?: string | null
          deductible_pct?: number
          gifi_code?: string | null
          icon?: string | null
          id?: string
          is_capital?: boolean
          kind: string
          name: string
          sort?: number
        }
        Update: {
          archived?: boolean
          cca_class?: string | null
          color?: string | null
          deductible_pct?: number
          gifi_code?: string | null
          icon?: string | null
          id?: string
          is_capital?: boolean
          kind?: string
          name?: string
          sort?: number
        }
        Relationships: []
      }
      clients: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          archived: boolean
          cc_emails: string[]
          city: string | null
          company_name: string | null
          contact_name: string | null
          country: string
          created_at: string
          currency: string
          default_tax_rate_id: string | null
          display_name: string
          email: string | null
          id: string
          notes: string | null
          phone: string | null
          postal_code: string | null
          province: string | null
          terms_days: number | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          archived?: boolean
          cc_emails?: string[]
          city?: string | null
          company_name?: string | null
          contact_name?: string | null
          country?: string
          created_at?: string
          currency?: string
          default_tax_rate_id?: string | null
          display_name: string
          email?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          terms_days?: number | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          archived?: boolean
          cc_emails?: string[]
          city?: string | null
          company_name?: string | null
          contact_name?: string | null
          country?: string
          created_at?: string
          currency?: string
          default_tax_rate_id?: string | null
          display_name?: string
          email?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          terms_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_default_tax_rate_id_fkey"
            columns: ["default_tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          account_id: string | null
          created_at: string
          doc_type: string
          expires_on: string | null
          fiscal_year: number | null
          id: string
          issued_on: string | null
          notes: string | null
          period_end: string | null
          period_start: string | null
          title: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          doc_type: string
          expires_on?: string | null
          fiscal_year?: number | null
          id?: string
          issued_on?: string | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          doc_type?: string
          expires_on?: string | null
          fiscal_year?: number | null
          id?: string
          issued_on?: string | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "money_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          bank_transaction_id: string | null
          billable: boolean
          billed_invoice_id: string | null
          business_pct: number
          category_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          fx_rate: number
          gst_hst: number
          id: string
          nature: Database["accounts"]["Enums"]["expense_nature"]
          notes: string | null
          paid_from_account_id: string
          project_id: string | null
          pst: number
          recurring_expense_id: string | null
          settled: boolean
          settled_on: string | null
          settlement_transfer_id: string | null
          source: string
          spent_by: string
          spent_on: string
          subtotal: number
          tags: string[]
          total: number
          total_cad: number | null
          updated_at: string
          vendor: string
        }
        Insert: {
          bank_transaction_id?: string | null
          billable?: boolean
          billed_invoice_id?: string | null
          business_pct?: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          fx_rate?: number
          gst_hst?: number
          id?: string
          nature?: Database["accounts"]["Enums"]["expense_nature"]
          notes?: string | null
          paid_from_account_id: string
          project_id?: string | null
          pst?: number
          recurring_expense_id?: string | null
          settled?: boolean
          settled_on?: string | null
          settlement_transfer_id?: string | null
          source?: string
          spent_by: string
          spent_on?: string
          subtotal?: number
          tags?: string[]
          total: number
          total_cad?: number | null
          updated_at?: string
          vendor: string
        }
        Update: {
          bank_transaction_id?: string | null
          billable?: boolean
          billed_invoice_id?: string | null
          business_pct?: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          fx_rate?: number
          gst_hst?: number
          id?: string
          nature?: Database["accounts"]["Enums"]["expense_nature"]
          notes?: string | null
          paid_from_account_id?: string
          project_id?: string | null
          pst?: number
          recurring_expense_id?: string | null
          settled?: boolean
          settled_on?: string | null
          settlement_transfer_id?: string | null
          source?: string
          spent_by?: string
          spent_on?: string
          subtotal?: number
          tags?: string[]
          total?: number
          total_cad?: number | null
          updated_at?: string
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_bank_txn_fk"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_billed_invoice_id_fkey"
            columns: ["billed_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_billed_invoice_id_fkey"
            columns: ["billed_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "money_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_recurring_expense_id_fkey"
            columns: ["recurring_expense_id"]
            isOneToOne: false
            referencedRelation: "recurring_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_settlement_transfer_id_fkey"
            columns: ["settlement_transfer_id"]
            isOneToOne: false
            referencedRelation: "member_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_spent_by_fkey"
            columns: ["spent_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "expenses_spent_by_fkey"
            columns: ["spent_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          currency: string
          rate_date: string
          rate_to_cad: number
          source: string
        }
        Insert: {
          currency: string
          rate_date: string
          rate_to_cad: number
          source?: string
        }
        Update: {
          currency?: string
          rate_date?: string
          rate_to_cad?: number
          source?: string
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          account_id: string
          created_at: string
          date_from: string | null
          date_to: string | null
          file_format: string | null
          file_name: string
          file_path: string | null
          id: string
          imported_by: string | null
          rows_duplicate: number
          rows_imported: number
          rows_matched: number
          rows_total: number
        }
        Insert: {
          account_id: string
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          file_format?: string | null
          file_name: string
          file_path?: string | null
          id?: string
          imported_by?: string | null
          rows_duplicate?: number
          rows_imported?: number
          rows_matched?: number
          rows_total?: number
        }
        Update: {
          account_id?: string
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          file_format?: string | null
          file_name?: string
          file_path?: string | null
          id?: string
          imported_by?: string | null
          rows_duplicate?: number
          rows_imported?: number
          rows_matched?: number
          rows_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "money_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "import_batches_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          amount: number | null
          description: string
          detail: string | null
          id: string
          invoice_id: string
          item_id: string | null
          quantity: number
          sort: number
          tax_rate_id: string | null
          unit: string | null
          unit_price: number
        }
        Insert: {
          amount?: number | null
          description: string
          detail?: string | null
          id?: string
          invoice_id: string
          item_id?: string | null
          quantity?: number
          sort?: number
          tax_rate_id?: string | null
          unit?: string | null
          unit_price?: number
        }
        Update: {
          amount?: number | null
          description?: string
          detail?: string | null
          id?: string
          invoice_id?: string
          item_id?: string | null
          quantity?: number
          sort?: number
          tax_rate_id?: string | null
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_tax_rate_id_fkey"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_revisions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string
          reason: string | null
          revision: number
          snapshot: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id: string
          reason?: string | null
          revision: number
          snapshot: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string
          reason?: string | null
          revision?: number
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "invoice_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "invoice_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_revisions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_revisions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          archived_pdf_path: string | null
          balance: number | null
          client_id: string
          converted_from: string | null
          created_at: string
          created_by: string | null
          currency: string
          discount: number
          due_date: string | null
          fx_rate: number
          id: string
          issue_date: string
          kind: Database["accounts"]["Enums"]["invoice_kind"]
          last_reminded_at: string | null
          notes: string | null
          number: string
          po_number: string | null
          project_id: string | null
          recurring_id: string | null
          revision: number
          sent_at: string | null
          share_token: string
          status: Database["accounts"]["Enums"]["invoice_status"]
          subtotal: number
          tax_total: number
          terms: string | null
          title: string | null
          total: number
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          amount_paid?: number
          archived_pdf_path?: string | null
          balance?: number | null
          client_id: string
          converted_from?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount?: number
          due_date?: string | null
          fx_rate?: number
          id?: string
          issue_date?: string
          kind?: Database["accounts"]["Enums"]["invoice_kind"]
          last_reminded_at?: string | null
          notes?: string | null
          number: string
          po_number?: string | null
          project_id?: string | null
          recurring_id?: string | null
          revision?: number
          sent_at?: string | null
          share_token?: string
          status?: Database["accounts"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_total?: number
          terms?: string | null
          title?: string | null
          total?: number
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          amount_paid?: number
          archived_pdf_path?: string | null
          balance?: number | null
          client_id?: string
          converted_from?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount?: number
          due_date?: string | null
          fx_rate?: number
          id?: string
          issue_date?: string
          kind?: Database["accounts"]["Enums"]["invoice_kind"]
          last_reminded_at?: string | null
          notes?: string | null
          number?: string
          po_number?: string | null
          project_id?: string | null
          recurring_id?: string | null
          revision?: number
          sent_at?: string | null
          share_token?: string
          status?: Database["accounts"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_total?: number
          terms?: string | null
          title?: string | null
          total?: number
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_converted_from_fkey"
            columns: ["converted_from"]
            isOneToOne: false
            referencedRelation: "invoice_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_converted_from_fkey"
            columns: ["converted_from"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_recurring_fk"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          archived: boolean
          category_id: string | null
          description: string | null
          id: string
          name: string
          tax_rate_id: string | null
          unit: string | null
          unit_price: number
        }
        Insert: {
          archived?: boolean
          category_id?: string | null
          description?: string | null
          id?: string
          name: string
          tax_rate_id?: string | null
          unit?: string | null
          unit_price?: number
        }
        Update: {
          archived?: boolean
          category_id?: string | null
          description?: string | null
          id?: string
          name?: string
          tax_rate_id?: string | null
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_tax_rate_id_fkey"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      member_transfers: {
        Row: {
          account_id: string | null
          amount: number
          created_at: string
          id: string
          kind: string
          member_id: string
          notes: string | null
          occurred_on: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          created_at?: string
          id?: string
          kind: string
          member_id: string
          notes?: string | null
          occurred_on?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          created_at?: string
          id?: string
          kind?: string
          member_id?: string
          notes?: string | null
          occurred_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_transfers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "money_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_transfers_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "member_transfers_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          active: boolean
          color: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          initials: string | null
          ownership_pct: number | null
          preferences: Json
          role: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          color?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          initials?: string | null
          ownership_pct?: number | null
          preferences?: Json
          role?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          color?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          initials?: string | null
          ownership_pct?: number | null
          preferences?: Json
          role?: string
          user_id?: string | null
        }
        Relationships: []
      }
      mileage_trips: {
        Row: {
          created_at: string
          destination: string | null
          id: string
          km: number
          member_id: string
          origin: string | null
          project_id: string | null
          purpose: string
          rate_per_km: number
          reimbursed: boolean
          reimbursed_on: string | null
          round_trip: boolean
          settlement_transfer_id: string | null
          trip_on: string
        }
        Insert: {
          created_at?: string
          destination?: string | null
          id?: string
          km: number
          member_id: string
          origin?: string | null
          project_id?: string | null
          purpose: string
          rate_per_km: number
          reimbursed?: boolean
          reimbursed_on?: string | null
          round_trip?: boolean
          settlement_transfer_id?: string | null
          trip_on?: string
        }
        Update: {
          created_at?: string
          destination?: string | null
          id?: string
          km?: number
          member_id?: string
          origin?: string | null
          project_id?: string | null
          purpose?: string
          rate_per_km?: number
          reimbursed?: boolean
          reimbursed_on?: string | null
          round_trip?: boolean
          settlement_transfer_id?: string | null
          trip_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "mileage_trips_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "mileage_trips_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mileage_trips_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mileage_trips_settlement_transfer_id_fkey"
            columns: ["settlement_transfer_id"]
            isOneToOne: false
            referencedRelation: "member_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      money_accounts: {
        Row: {
          archived: boolean
          color: string | null
          created_at: string
          csv_mapping: Json | null
          currency: string
          id: string
          institution: string | null
          is_business: boolean
          kind: Database["accounts"]["Enums"]["money_account_kind"]
          last4: string | null
          name: string
          notes: string | null
          opening_balance: number
          owner_member_id: string | null
        }
        Insert: {
          archived?: boolean
          color?: string | null
          created_at?: string
          csv_mapping?: Json | null
          currency?: string
          id?: string
          institution?: string | null
          is_business?: boolean
          kind: Database["accounts"]["Enums"]["money_account_kind"]
          last4?: string | null
          name: string
          notes?: string | null
          opening_balance?: number
          owner_member_id?: string | null
        }
        Update: {
          archived?: boolean
          color?: string | null
          created_at?: string
          csv_mapping?: Json | null
          currency?: string
          id?: string
          institution?: string | null
          is_business?: boolean
          kind?: Database["accounts"]["Enums"]["money_account_kind"]
          last4?: string | null
          name?: string
          notes?: string | null
          opening_balance?: number
          owner_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "money_accounts_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "money_accounts_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      other_income: {
        Row: {
          account_id: string | null
          amount: number
          bank_transaction_id: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          fx_rate: number
          gst_hst: number
          id: string
          notes: string | null
          received_on: string
          source: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          bank_transaction_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          fx_rate?: number
          gst_hst?: number
          id?: string
          notes?: string | null
          received_on?: string
          source: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          bank_transaction_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          fx_rate?: number
          gst_hst?: number
          id?: string
          notes?: string | null
          received_on?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "other_income_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "money_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "other_income_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "other_income_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "other_income_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "other_income_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          amount: number
          id: string
          invoice_id: string
          payment_id: string
        }
        Insert: {
          amount: number
          id?: string
          invoice_id: string
          payment_id: string
        }
        Update: {
          amount?: number
          id?: string
          invoice_id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          client_id: string | null
          created_at: string
          currency: string
          deposit_account_id: string | null
          fx_rate: number
          id: string
          method: Database["accounts"]["Enums"]["payment_method"]
          notes: string | null
          received_on: string
          recorded_by: string | null
          reference: string | null
        }
        Insert: {
          amount: number
          client_id?: string | null
          created_at?: string
          currency?: string
          deposit_account_id?: string | null
          fx_rate?: number
          id?: string
          method?: Database["accounts"]["Enums"]["payment_method"]
          notes?: string | null
          received_on?: string
          recorded_by?: string | null
          reference?: string | null
        }
        Update: {
          amount?: number
          client_id?: string | null
          created_at?: string
          currency?: string
          deposit_account_id?: string | null
          fx_rate?: number
          id?: string
          method?: Database["accounts"]["Enums"]["payment_method"]
          notes?: string | null
          received_on?: string
          recorded_by?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_deposit_account_id_fkey"
            columns: ["deposit_account_id"]
            isOneToOne: false
            referencedRelation: "money_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          budget: number | null
          client_id: string | null
          created_at: string
          ended_on: string | null
          id: string
          name: string
          notes: string | null
          started_on: string | null
          status: string
        }
        Insert: {
          budget?: number | null
          client_id?: string | null
          created_at?: string
          ended_on?: string | null
          id?: string
          name: string
          notes?: string | null
          started_on?: string | null
          status?: string
        }
        Update: {
          budget?: number | null
          client_id?: string | null
          created_at?: string
          ended_on?: string | null
          id?: string
          name?: string
          notes?: string | null
          started_on?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliations: {
        Row: {
          account_id: string
          computed_balance: number
          id: string
          notes: string | null
          period_end: string
          reconciled_at: string
          reconciled_by: string | null
          statement_balance: number
        }
        Insert: {
          account_id: string
          computed_balance: number
          id?: string
          notes?: string | null
          period_end: string
          reconciled_at?: string
          reconciled_by?: string | null
          statement_balance: number
        }
        Update: {
          account_id?: string
          computed_balance?: number
          id?: string
          notes?: string | null
          period_end?: string
          reconciled_at?: string
          reconciled_by?: string | null
          statement_balance?: number
        }
        Relationships: [
          {
            foreignKeyName: "reconciliations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "money_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliations_reconciled_by_fkey"
            columns: ["reconciled_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "reconciliations_reconciled_by_fkey"
            columns: ["reconciled_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_expenses: {
        Row: {
          active: boolean
          amount: number
          business_pct: number
          category_id: string | null
          created_at: string
          currency: string
          description: string | null
          frequency: string
          gst_hst: number
          id: string
          nature: Database["accounts"]["Enums"]["expense_nature"]
          next_on: string
          notes: string | null
          paid_from_account_id: string
          project_id: string | null
          pst: number
          spent_by: string
          vendor: string
        }
        Insert: {
          active?: boolean
          amount: number
          business_pct?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          frequency: string
          gst_hst?: number
          id?: string
          nature?: Database["accounts"]["Enums"]["expense_nature"]
          next_on: string
          notes?: string | null
          paid_from_account_id: string
          project_id?: string | null
          pst?: number
          spent_by: string
          vendor: string
        }
        Update: {
          active?: boolean
          amount?: number
          business_pct?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          frequency?: string
          gst_hst?: number
          id?: string
          nature?: Database["accounts"]["Enums"]["expense_nature"]
          next_on?: string
          notes?: string | null
          paid_from_account_id?: string
          project_id?: string | null
          pst?: number
          spent_by?: string
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expenses_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "money_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expenses_spent_by_fkey"
            columns: ["spent_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "recurring_expenses_spent_by_fkey"
            columns: ["spent_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_invoices: {
        Row: {
          active: boolean
          auto_send: boolean
          client_id: string
          created_at: string
          end_on: string | null
          frequency: string
          id: string
          next_run_on: string
          project_id: string | null
          template_invoice_id: string | null
        }
        Insert: {
          active?: boolean
          auto_send?: boolean
          client_id: string
          created_at?: string
          end_on?: string | null
          frequency: string
          id?: string
          next_run_on: string
          project_id?: string | null
          template_invoice_id?: string | null
        }
        Update: {
          active?: boolean
          auto_send?: boolean
          client_id?: string
          created_at?: string
          end_on?: string | null
          frequency?: string
          id?: string
          next_run_on?: string
          project_id?: string | null
          template_invoice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_invoices_template_invoice_id_fkey"
            columns: ["template_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_invoices_template_invoice_id_fkey"
            columns: ["template_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      rules: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          match_text: string
          nature: Database["accounts"]["Enums"]["expense_nature"] | null
          priority: number
          project_id: string | null
          times_applied: number
          vendor_rename: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          match_text: string
          nature?: Database["accounts"]["Enums"]["expense_nature"] | null
          priority?: number
          project_id?: string | null
          times_applied?: number
          vendor_rename?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          match_text?: string
          nature?: Database["accounts"]["Enums"]["expense_nature"] | null
          priority?: number
          project_id?: string | null
          times_applied?: number
          vendor_rename?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rules_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_filings: {
        Row: {
          amount_owing: number | null
          confirmation: string | null
          created_at: string
          document_id: string | null
          due_on: string | null
          filed_by: string | null
          filed_on: string | null
          id: string
          kind: string
          notes: string | null
          paid_on: string | null
          period_end: string
          period_start: string
          worksheet: Json
        }
        Insert: {
          amount_owing?: number | null
          confirmation?: string | null
          created_at?: string
          document_id?: string | null
          due_on?: string | null
          filed_by?: string | null
          filed_on?: string | null
          id?: string
          kind: string
          notes?: string | null
          paid_on?: string | null
          period_end: string
          period_start: string
          worksheet?: Json
        }
        Update: {
          amount_owing?: number | null
          confirmation?: string | null
          created_at?: string
          document_id?: string | null
          due_on?: string | null
          filed_by?: string | null
          filed_on?: string | null
          id?: string
          kind?: string
          notes?: string | null
          paid_on?: string | null
          period_end?: string
          period_start?: string
          worksheet?: Json
        }
        Relationships: [
          {
            foreignKeyName: "tax_filings_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_filings_filed_by_fkey"
            columns: ["filed_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "tax_filings_filed_by_fkey"
            columns: ["filed_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rates: {
        Row: {
          active: boolean
          code: string
          id: string
          is_recoverable: boolean
          kind: string
          name: string
          province: string | null
          rate: number
        }
        Insert: {
          active?: boolean
          code: string
          id?: string
          is_recoverable?: boolean
          kind?: string
          name: string
          province?: string | null
          rate: number
        }
        Update: {
          active?: boolean
          code?: string
          id?: string
          is_recoverable?: boolean
          kind?: string
          name?: string
          province?: string | null
          rate?: number
        }
        Relationships: []
      }
    }
    Views: {
      expense_overview: {
        Row: {
          attachment_count: number | null
          bank_transaction_id: string | null
          billable: boolean | null
          billed_invoice_id: string | null
          business_pct: number | null
          category_icon: string | null
          category_id: string | null
          category_name: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          deductible_cad: number | null
          description: string | null
          effective_business_pct: number | null
          fx_rate: number | null
          gifi_code: string | null
          gst_hst: number | null
          id: string | null
          is_capital: boolean | null
          itc_cad: number | null
          nature: Database["accounts"]["Enums"]["expense_nature"] | null
          notes: string | null
          paid_from_account_id: string | null
          paid_from_kind:
            | Database["accounts"]["Enums"]["money_account_kind"]
            | null
          paid_from_name: string | null
          paid_with_business_funds: boolean | null
          project_id: string | null
          project_name: string | null
          pst: number | null
          recurring_expense_id: string | null
          settled: boolean | null
          settled_on: string | null
          source: string | null
          spent_by: string | null
          spent_by_color: string | null
          spent_by_initials: string | null
          spent_by_name: string | null
          spent_on: string | null
          subtotal: number | null
          tags: string[] | null
          total: number | null
          total_cad: number | null
          updated_at: string | null
          vendor: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_bank_txn_fk"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_billed_invoice_id_fkey"
            columns: ["billed_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_billed_invoice_id_fkey"
            columns: ["billed_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "money_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_recurring_expense_id_fkey"
            columns: ["recurring_expense_id"]
            isOneToOne: false
            referencedRelation: "recurring_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_spent_by_fkey"
            columns: ["spent_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "expenses_spent_by_fkey"
            columns: ["spent_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_overview: {
        Row: {
          amount_paid: number | null
          archived_pdf_path: string | null
          balance: number | null
          client_email: string | null
          client_id: string | null
          client_name: string | null
          converted_from: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          days_overdue: number | null
          discount: number | null
          due_date: string | null
          fx_rate: number | null
          id: string | null
          is_overdue: boolean | null
          issue_date: string | null
          kind: Database["accounts"]["Enums"]["invoice_kind"] | null
          last_payment_on: string | null
          last_reminded_at: string | null
          notes: string | null
          number: string | null
          po_number: string | null
          project_id: string | null
          project_name: string | null
          recurring_id: string | null
          revision: number | null
          sent_at: string | null
          share_token: string | null
          status: Database["accounts"]["Enums"]["invoice_status"] | null
          subtotal: number | null
          tax_total: number | null
          terms: string | null
          title: string | null
          total: number | null
          total_cad: number | null
          updated_at: string | null
          viewed_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_converted_from_fkey"
            columns: ["converted_from"]
            isOneToOne: false
            referencedRelation: "invoice_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_converted_from_fkey"
            columns: ["converted_from"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_recurring_fk"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      member_balances: {
        Row: {
          balance: number | null
          full_name: string | null
          member_id: string | null
        }
        Relationships: []
      }
      member_ledger: {
        Row: {
          amount: number | null
          created_at: string | null
          detail: string | null
          entity_id: string | null
          entry_type: string | null
          kind: string | null
          label: string | null
          member_id: string | null
          occurred_on: string | null
          repay_by: string | null
          settled: boolean | null
          settled_on: string | null
          settlement_transfer_id: string | null
          total_cad: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      account_balance_at: {
        Args: { p_account: string; p_on: string }
        Returns: number
      }
      apply_rules_to_unreviewed: {
        Args: { p_account?: string }
        Returns: number
      }
      bank_dedupe_hash: {
        Args: {
          p_account: string
          p_amount: number
          p_description: string
          p_on: string
        }
        Returns: string
      }
      best_rule: { Args: { p_description: string }; Returns: string }
      current_member_id: { Args: never; Returns: string }
      export_tables: { Args: never; Returns: string[] }
      fiscal_year_end_on: { Args: { p_on: string }; Returns: string }
      invoice_snapshot: { Args: { p_invoice: string }; Returns: Json }
      is_member: { Args: never; Returns: boolean }
      mileage_rate_for: {
        Args: {
          p_exclude?: string
          p_km: number
          p_member: string
          p_trip_on: string
        }
        Returns: number
      }
      next_document_number: {
        Args: { p_kind: Database["accounts"]["Enums"]["invoice_kind"] }
        Returns: string
      }
      normalise_bank_description: { Args: { p: string }; Returns: string }
      public_invoice: { Args: { p_token: string }; Returns: Json }
      recalc_invoice: { Args: { p_invoice: string }; Returns: undefined }
      recalc_invoice_paid: { Args: { p_invoice: string }; Returns: undefined }
      replace_invoice_lines: {
        Args: { p_invoice: string; p_lines: Json }
        Returns: undefined
      }
      shareholder_loan_repay_by: { Args: { p_on: string }; Returns: string }
      undo_import: { Args: { p_batch: string }; Returns: Json }
    }
    Enums: {
      bank_txn_status: "unreviewed" | "matched" | "created" | "ignored"
      expense_nature: "business" | "personal" | "mixed"
      invoice_kind: "invoice" | "estimate" | "credit_note"
      invoice_status:
        | "draft"
        | "sent"
        | "partial"
        | "paid"
        | "void"
        | "accepted"
        | "declined"
      money_account_kind:
        | "bank"
        | "credit_card"
        | "cash"
        | "personal"
        | "payment_processor"
      payment_method:
        | "etransfer"
        | "eft"
        | "wire"
        | "cheque"
        | "card"
        | "cash"
        | "stripe"
        | "other"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  accounts: {
    Enums: {
      bank_txn_status: ["unreviewed", "matched", "created", "ignored"],
      expense_nature: ["business", "personal", "mixed"],
      invoice_kind: ["invoice", "estimate", "credit_note"],
      invoice_status: [
        "draft",
        "sent",
        "partial",
        "paid",
        "void",
        "accepted",
        "declined",
      ],
      money_account_kind: [
        "bank",
        "credit_card",
        "cash",
        "personal",
        "payment_processor",
      ],
      payment_method: [
        "etransfer",
        "eft",
        "wire",
        "cheque",
        "card",
        "cash",
        "stripe",
        "other",
      ],
    },
  },
} as const
