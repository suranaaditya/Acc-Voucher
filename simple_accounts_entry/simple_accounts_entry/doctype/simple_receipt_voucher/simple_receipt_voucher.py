from frappe.model.document import Document

from simple_accounts_entry.simple_accounts_entry.utils.voucher_posting import (
	create_journal_entry_from_simple_voucher,
	create_payment_entry_from_simple_voucher,
	cancel_linked_backend_doc,
	mark_post_success,
)


class SimpleReceiptVoucher(Document):
	def before_submit(self):
		if self.entry_mode == "Party-wise":
			backend_doc = create_payment_entry_from_simple_voucher(self, is_receipt=True)
		else:
			backend_doc = create_journal_entry_from_simple_voucher(self, is_receipt=True)

		mark_post_success(self, backend_doc)

	def on_cancel(self):
		cancel_linked_backend_doc(self)
		self.db_set("posting_status", "Cancelled", update_modified=False)
		self.db_set("is_posted", 0, update_modified=False)