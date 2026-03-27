import frappe
from frappe import _
from frappe.utils import flt


def validate_company_links(doc):
	if getattr(doc, "cost_center", None):
		cc_company = frappe.db.get_value("Cost Center", doc.cost_center, "company")
		if cc_company and cc_company != doc.company:
			frappe.throw(
				_("Cost Center {0} does not belong to Company {1}").format(doc.cost_center, doc.company)
			)

	if getattr(doc, "project", None):
		project_company = frappe.db.get_value("Project", doc.project, "company")
		if project_company and project_company != doc.company:
			frappe.throw(
				_("Project {0} does not belong to Company {1}").format(doc.project, doc.company)
			)


def validate_row_company_links(doc):
	for row in (doc.account_rows or []):
		if getattr(row, "cost_center", None):
			cc_company = frappe.db.get_value("Cost Center", row.cost_center, "company")
			if cc_company and cc_company != doc.company:
				frappe.throw(
					_("Row #{0}: Cost Center {1} does not belong to Company {2}").format(
						row.idx, row.cost_center, doc.company
					)
				)

		if getattr(row, "project", None):
			project_company = frappe.db.get_value("Project", row.project, "company")
			if project_company and project_company != doc.company:
				frappe.throw(
					_("Row #{0}: Project {1} does not belong to Company {2}").format(
						row.idx, row.project, doc.company
					)
				)

		if getattr(row, "account", None):
			acc_company = frappe.db.get_value("Account", row.account, "company")
			if acc_company and acc_company != doc.company:
				frappe.throw(
					_("Row #{0}: Account {1} does not belong to Company {2}").format(
						row.idx, row.account, doc.company
					)
				)


def validate_main_account_company(account, company, label):
	if not account:
		frappe.throw(_("{0} is mandatory").format(label))

	acc_company = frappe.db.get_value("Account", account, "company")
	if acc_company and acc_company != company:
		frappe.throw(
			_("{0} {1} does not belong to Company {2}").format(label, account, company)
		)


def validate_cash_bank_account(account, company, label):
	validate_main_account_company(account, company, label)

	account_type = frappe.db.get_value("Account", account, "account_type")
	if account_type not in ("Bank", "Cash", "Cash Over Short"):
		frappe.throw(_("{0} must be a Bank or Cash account").format(label))


def validate_paid_from_account_required(doc):
	if not getattr(doc, "paid_from_account", None):
		frappe.throw(_("Paid From Account is mandatory"))


def validate_headwise_total(doc):
	total = 0
	for row in (doc.account_rows or []):
		if not row.account:
			frappe.throw(_("Row #{0}: Account is mandatory").format(row.idx))
		if flt(row.amount) <= 0:
			frappe.throw(_("Row #{0}: Amount must be greater than zero").format(row.idx))
		total += flt(row.amount)

	if not doc.account_rows:
		frappe.throw(_("At least one Account Row is required for Head-wise entry"))

	if flt(total) != flt(doc.amount):
		frappe.throw(
			_("Total of account rows ({0}) must equal voucher amount ({1})").format(
				flt(total), flt(doc.amount)
			)
		)


def validate_partywise(doc):
	if not doc.party:
		frappe.throw(_("Party is mandatory for Party-wise entry"))
	if not doc.party_type:
		frappe.throw(_("Party Type could not be detected"))
	if flt(doc.amount) <= 0:
		frappe.throw(_("Amount must be greater than zero"))
	validate_company_links(doc)


def validate_contra(doc):
	if flt(doc.amount) <= 0:
		frappe.throw(_("Amount must be greater than zero"))

	if not getattr(doc, "transfer_from_account", None):
		frappe.throw(_("Transfer From Account is mandatory for Contra Entry"))

	if not getattr(doc, "transfer_to_account", None):
		frappe.throw(_("Transfer To Account is mandatory for Contra Entry"))

	if doc.transfer_from_account == doc.transfer_to_account:
		frappe.throw(_("Transfer From Account and Transfer To Account cannot be the same"))

	validate_company_links(doc)
	validate_cash_bank_account(doc.transfer_from_account, doc.company, "Transfer From Account")
	validate_cash_bank_account(doc.transfer_to_account, doc.company, "Transfer To Account")


def create_payment_entry_from_simple_voucher(doc, is_receipt=False):
	validate_partywise(doc)

	main_account = doc.received_in_account if is_receipt else doc.paid_from_account
	validate_main_account_company(
		main_account,
		doc.company,
		"Received In Account" if is_receipt else "Paid From Account"
	)

	pe = frappe.new_doc("Payment Entry")
	pe.payment_type = "Receive" if is_receipt else "Pay"
	pe.company = doc.company
	pe.posting_date = doc.posting_date
	pe.party_type = doc.party_type
	pe.party = doc.party

	if is_receipt:
		pe.paid_to = doc.received_in_account
		pe.received_amount = flt(doc.amount)
		pe.paid_amount = flt(doc.amount)
	else:
		pe.paid_from = doc.paid_from_account
		pe.paid_amount = flt(doc.amount)
		pe.received_amount = flt(doc.amount)

	mode_of_payment = getattr(doc, "receipt_method", None) if is_receipt else getattr(doc, "payment_method", None)
	if mode_of_payment and hasattr(pe, "mode_of_payment"):
		pe.mode_of_payment = mode_of_payment

	if getattr(doc, "reference_no", None):
		pe.reference_no = doc.reference_no
	if getattr(doc, "reference_date", None):
		pe.reference_date = doc.reference_date

	if getattr(doc, "cost_center", None):
		pe.cost_center = doc.cost_center
	if getattr(doc, "project", None):
		pe.project = doc.project

	pe.source_simple_voucher_doctype = doc.doctype
	pe.source_simple_voucher = doc.name

	try:
		pe.insert(ignore_permissions=True)

		if hasattr(pe, "custom_remarks"):
			pe.custom_remarks = 1

		if hasattr(pe, "remarks"):
			pe.remarks = doc.remarks or ""

		pe.save(ignore_permissions=True)
		pe.submit()
		return pe

	except Exception as e:
		if getattr(pe, "name", None) and frappe.db.exists("Payment Entry", pe.name):
			try:
				created_pe = frappe.get_doc("Payment Entry", pe.name)
				if created_pe.docstatus == 0:
					created_pe.delete(ignore_permissions=True)
			except Exception:
				pass
		frappe.throw(str(e))


def create_journal_entry_from_simple_voucher(doc, is_receipt=False):
	validate_company_links(doc)
	validate_row_company_links(doc)
	validate_headwise_total(doc)
	validate_paid_from_account_required(doc)

	main_account = doc.received_in_account if is_receipt else doc.paid_from_account
	validate_main_account_company(
		main_account,
		doc.company,
		"Received In Account" if is_receipt else "Paid From Account"
	)

	method = getattr(doc, "receipt_method", None) if is_receipt else getattr(doc, "payment_method", None)

	if method == "Cash":
		entry_type = "Cash Entry"
	else:
		entry_type = "Bank Entry"

	je = frappe.new_doc("Journal Entry")
	je.voucher_type = entry_type
	je.company = doc.company
	je.posting_date = doc.posting_date
	je.user_remark = doc.remarks or ""

	if getattr(doc, "reference_no", None):
		je.cheque_no = doc.reference_no

	if getattr(doc, "reference_date", None):
		je.cheque_date = doc.reference_date

	je.append("accounts", {
		"account": main_account,
		"debit_in_account_currency": flt(doc.amount) if is_receipt else 0,
		"credit_in_account_currency": flt(doc.amount) if not is_receipt else 0,
		"cost_center": getattr(doc, "cost_center", None),
		"project": getattr(doc, "project", None),
	})

	for row in (doc.account_rows or []):
		je.append("accounts", {
			"account": row.account,
			"debit_in_account_currency": flt(row.amount) if not is_receipt else 0,
			"credit_in_account_currency": flt(row.amount) if is_receipt else 0,
			"cost_center": row.cost_center or getattr(doc, "cost_center", None),
			"project": row.project or getattr(doc, "project", None),
		})

	je.source_simple_voucher_doctype = doc.doctype
	je.source_simple_voucher = doc.name

	try:
		je.insert(ignore_permissions=True)
		je.submit()
		return je
	except Exception as e:
		if getattr(je, "name", None) and frappe.db.exists("Journal Entry", je.name):
			try:
				created_je = frappe.get_doc("Journal Entry", je.name)
				if created_je.docstatus == 0:
					created_je.delete(ignore_permissions=True)
			except Exception:
				pass
		frappe.throw(str(e))


def create_contra_journal_entry_from_simple_voucher(doc):
	validate_contra(doc)

	je = frappe.new_doc("Journal Entry")
	je.voucher_type = "Contra Entry"
	je.company = doc.company
	je.posting_date = doc.posting_date
	je.user_remark = doc.remarks or ""

	if getattr(doc, "reference_no", None):
		je.cheque_no = doc.reference_no

	if getattr(doc, "reference_date", None):
		je.cheque_date = doc.reference_date

	je.append("accounts", {
		"account": doc.transfer_to_account,
		"debit_in_account_currency": flt(doc.amount),
		"credit_in_account_currency": 0,
		"cost_center": getattr(doc, "cost_center", None),
		"project": getattr(doc, "project", None),
	})

	je.append("accounts", {
		"account": doc.transfer_from_account,
		"debit_in_account_currency": 0,
		"credit_in_account_currency": flt(doc.amount),
		"cost_center": getattr(doc, "cost_center", None),
		"project": getattr(doc, "project", None),
	})

	je.source_simple_voucher_doctype = doc.doctype
	je.source_simple_voucher = doc.name

	try:
		je.insert(ignore_permissions=True)
		je.submit()
		return je
	except Exception as e:
		if getattr(je, "name", None) and frappe.db.exists("Journal Entry", je.name):
			try:
				created_je = frappe.get_doc("Journal Entry", je.name)
				if created_je.docstatus == 0:
					created_je.delete(ignore_permissions=True)
			except Exception:
				pass
		frappe.throw(str(e))


def cancel_linked_backend_doc(doc):
	if not doc.backend_doctype or not doc.backend_document:
		return

	if not frappe.db.exists(doc.backend_doctype, doc.backend_document):
		return

	backend_doc = frappe.get_doc(doc.backend_doctype, doc.backend_document)
	if backend_doc.docstatus == 1:
		backend_doc.cancel()


def mark_post_success(doc, backend_doc):
	doc.backend_doctype = backend_doc.doctype
	doc.backend_document = backend_doc.name
	doc.is_posted = 1
	doc.posting_status = "Posted"
	doc.error_log = ""