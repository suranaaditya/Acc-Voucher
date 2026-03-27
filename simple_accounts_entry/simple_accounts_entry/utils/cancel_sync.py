import frappe


def cancel_linked_simple_voucher_from_backend(doc, method=None):
    # Prevent recursion when backend cancel is triggered from simple voucher side
    if getattr(doc.flags, "ignore_simple_voucher_sync", False):
        return

    source_dt = getattr(doc, "source_simple_voucher_doctype", None)
    source_name = getattr(doc, "source_simple_voucher", None)

    if not source_dt or not source_name:
        return

    if source_dt not in ("Simple Payment Voucher", "Simple Receipt Voucher"):
        return

    if not frappe.db.exists(source_dt, source_name):
        return

    source_doc = frappe.get_doc(source_dt, source_name)

    if source_doc.docstatus == 1:
        source_doc.flags.ignore_backend_cancel_sync = True
        source_doc.cancel()