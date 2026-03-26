frappe.ui.form.on("Simple Payment Voucher", {
    refresh(frm) {
        toggle_fields(frm);
        setup_party_autocomplete(frm);
        set_company_filters(frm);
    },

    entry_mode(frm) {
        toggle_fields(frm);
        clear_party_details_if_not_partywise(frm);
    },

    company(frm) {
        set_company_filters(frm);
    },

    payment_method(frm) {
        set_company_filters(frm);
        frm.set_value("paid_from_account", "");
    },

    party(frm) {
        if (!frm.doc.party) {
            frm.set_value("party_type", "");
            frm.set_value("party_name", "");
            frm.set_value("party_doctype", "");
        }
    }
});

function toggle_fields(frm) {
    const is_party = frm.doc.entry_mode === "Party-wise";
    frm.toggle_display("party_details_section", is_party);
    frm.toggle_display("headwise_section", !is_party);
    frm.toggle_display("account_rows", !is_party);
}

function clear_party_details_if_not_partywise(frm) {
    if (frm.doc.entry_mode !== "Party-wise") {
        frm.set_value("party", "");
        frm.set_value("party_type", "");
        frm.set_value("party_name", "");
        frm.set_value("party_doctype", "");
    }
}

function setup_party_autocomplete(frm) {
    if (frm.__party_awesomplete_setup) return;

    const party_field = frm.get_field("party");
    if (!party_field || !party_field.$input) return;

    const input = party_field.$input.get(0);
    if (!input) return;

    frm.__party_awesomplete_setup = true;

    if (!window.Awesomplete) return;

    const awesomplete = new Awesomplete(input, {
        minChars: 0,
        maxItems: 20,
        autoFirst: true,
        list: [],
        replace: function (suggestion) {
            this.input.value = suggestion.value.party;
        }
    });

    input.addEventListener("input", frappe.utils.debounce(function (e) {
        const txt = e.target.value || "";

        if (frm.doc.entry_mode !== "Party-wise") return;

        frappe.call({
            method: "simple_accounts_entry.api.search_parties",
            args: {
                txt: txt,
                page_len: 20
            },
            callback: function (r) {
                const rows = r.message || [];
                awesomplete.list = rows.map(row => ({
                    label: row.description,
                    value: row
                }));
                if (rows.length) {
                    awesomplete.evaluate();
                    awesomplete.open();
                }
            }
        });
    }, 300));

    input.addEventListener("awesomplete-selectcomplete", function (evt) {
        const row = evt.text.value;
        if (!row) return;

        frm.set_value("party", row.party);
        frm.set_value("party_type", row.party_type);
        frm.set_value("party_name", row.party_name);
        frm.set_value("party_doctype", row.party_doctype);
    });
}

function set_company_filters(frm) {
    frm.set_query("cost_center", function () {
        return {
            filters: {
                company: frm.doc.company
            }
        };
    });

    frm.set_query("project", function () {
        return {
            filters: {
                company: frm.doc.company
            }
        };
    });

    frm.set_query("paid_from_account", function () {
        let account_type_filter = [];

        if (frm.doc.payment_method === "Cash") {
            account_type_filter = ["in", ["Cash", "Cash Over Short"]];
        } else if (["Bank", "Cheque", "UPI"].includes(frm.doc.payment_method)) {
            account_type_filter = ["=", "Bank"];
        }

        let filters = {
            company: frm.doc.company,
            is_group: 0
        };

        if (account_type_filter.length) {
            filters.account_type = account_type_filter;
        }

        return { filters };
    });

    if (frm.fields_dict.account_rows && frm.fields_dict.account_rows.grid) {
        frm.fields_dict.account_rows.grid.get_field("cost_center").get_query = function (doc) {
            return {
                filters: {
                    company: doc.company
                }
            };
        };

        frm.fields_dict.account_rows.grid.get_field("project").get_query = function (doc) {
            return {
                filters: {
                    company: doc.company
                }
            };
        };

        frm.fields_dict.account_rows.grid.get_field("account").get_query = function (doc) {
            return {
                filters: {
                    company: doc.company,
                    is_group: 0
                }
            };
        };
    }
}