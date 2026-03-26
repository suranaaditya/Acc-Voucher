import frappe


@frappe.whitelist()
def search_parties(doctype=None, txt="", searchfield=None, start=0, page_len=20, filters=None):
	txt = (txt or "").strip()
	page_len = int(page_len or 20)

	parties = []

	customer_rows = frappe.get_all(
		"Customer",
		filters={"disabled": 0},
		fields=["name", "customer_name"],
		or_filters={
			"name": ["like", f"%{txt}%"],
			"customer_name": ["like", f"%{txt}%"],
		} if txt else None,
		limit_start=0,
		limit_page_length=page_len,
	)
	for row in customer_rows:
		parties.append({
			"party": row.name,
			"party_name": row.customer_name or row.name,
			"party_type": "Customer",
			"party_doctype": "Customer",
			"description": f"{row.customer_name or row.name} — Customer",
		})

	supplier_rows = frappe.get_all(
		"Supplier",
		filters={"disabled": 0},
		fields=["name", "supplier_name"],
		or_filters={
			"name": ["like", f"%{txt}%"],
			"supplier_name": ["like", f"%{txt}%"],
		} if txt else None,
		limit_start=0,
		limit_page_length=page_len,
	)
	for row in supplier_rows:
		parties.append({
			"party": row.name,
			"party_name": row.supplier_name or row.name,
			"party_type": "Supplier",
			"party_doctype": "Supplier",
			"description": f"{row.supplier_name or row.name} — Supplier",
		})

	employee_rows = frappe.get_all(
		"Employee",
		filters={"status": ["!=", "Left"]},
		fields=["name", "employee_name"],
		or_filters={
			"name": ["like", f"%{txt}%"],
			"employee_name": ["like", f"%{txt}%"],
		} if txt else None,
		limit_start=0,
		limit_page_length=page_len,
	)
	for row in employee_rows:
		parties.append({
			"party": row.name,
			"party_name": row.employee_name or row.name,
			"party_type": "Employee",
			"party_doctype": "Employee",
			"description": f"{row.employee_name or row.name} — Employee",
		})

	seen = set()
	result = []
	for p in parties:
		key = (p["party_type"], p["party"])
		if key not in seen:
			seen.add(key)
			result.append(p)

	result.sort(key=lambda d: (d["party_name"] or d["party"]).lower())
	return result[:page_len]


@frappe.whitelist()
def get_party_details(party, party_type=None):
	if not party:
		return {}

	if party_type:
		return _get_exact_party(party, party_type)

	if frappe.db.exists("Customer", party):
		return _get_exact_party(party, "Customer")

	if frappe.db.exists("Supplier", party):
		return _get_exact_party(party, "Supplier")

	if frappe.db.exists("Employee", party):
		return _get_exact_party(party, "Employee")

	return {}


def _get_exact_party(party, party_type):
	if party_type == "Customer":
		doc = frappe.get_doc("Customer", party)
		return {
			"party": doc.name,
			"party_name": doc.customer_name or doc.name,
			"party_type": "Customer",
			"party_doctype": "Customer",
			"description": f"{doc.customer_name or doc.name} — Customer",
		}

	if party_type == "Supplier":
		doc = frappe.get_doc("Supplier", party)
		return {
			"party": doc.name,
			"party_name": doc.supplier_name or doc.name,
			"party_type": "Supplier",
			"party_doctype": "Supplier",
			"description": f"{doc.supplier_name or doc.name} — Supplier",
		}

	if party_type == "Employee":
		doc = frappe.get_doc("Employee", party)
		return {
			"party": doc.name,
			"party_name": doc.employee_name or doc.name,
			"party_type": "Employee",
			"party_doctype": "Employee",
			"description": f"{doc.employee_name or doc.name} — Employee",
		}

	return {}