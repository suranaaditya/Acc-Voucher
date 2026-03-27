from frappe.model.document import Document

from simple_accounts_entry.simple_accounts_entry.utils.voucher_posting import (
	create_journal_entry_from_simple_voucher,
	create_payment_entries_from_simple_voucher,
	create_contra_journal_entry_from_simple_voucher,
	cancel_linked_backend_doc,
	mark_post_success,
	mark_post_success_for_multiple,
)


class SimplePaymentVoucher(Document):
	def before_submit(self):
		if self.entry_mode == "Party-wise":
			backend_docs = create_payment_entries_from_simple_voucher(self, is_receipt=False)
			mark_post_success_for_multiple(self, backend_docs)

		elif self.entry_mode == "Head-wise":
			backend_doc = create_journal_entry_from_simple_voucher(self, is_receipt=False)
			mark_post_success(self, backend_doc)

		elif self.entry_mode == "Contra Entry":
			backend_doc = create_contra_journal_entry_from_simple_voucher(self)
			mark_post_success(self, backend_doc)

		else:
			raise Exception(f"Unsupported Entry Mode: {self.entry_mode}")

	def on_cancel(self):
		cancel_linked_backend_doc(self)
		self.db_set("posting_status", "Cancelled", update_modified=False)
		self.db_set("is_posted", 0, update_modified=False)