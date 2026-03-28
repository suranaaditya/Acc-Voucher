frappe.ui.form.on("Simple Payment Voucher", {
    refresh(frm) {
        toggle_fields(frm);
        setup_party_autocomplete(frm);
        setup_party_row_autocomplete(frm);
        set_company_filters(frm);
        add_backend_navigation_button(frm);
        set_headwise_grid_columns(frm);
        set_party_row_grid_columns(frm);
        set_reference_labels(frm);
    },

    entry_mode(frm) {
        toggle_fields(frm);
        clear_irrelevant_fields(frm);
        set_company_filters(frm);
        set_headwise_grid_columns(frm);
        set_party_row_grid_columns(frm);
        setup_party_row_autocomplete(frm);
    },

    company(frm) {
        set_company_filters(frm);
    },

    payment_method(frm) {
        set_company_filters(frm);
        set_reference_labels(frm);

        if (frm.doc.entry_mode !== "Contra Entry") {
            frm.set_value("paid_from_account", "");
        }
    }
});

frappe.ui.form.on("Simple Payment Party Row", {
    party(frm, cdt, cdn) {
        populate_party_row_details(cdt, cdn);
    }
});

function toggle_fields(frm) {
    const mode = frm.doc.entry_mode;

    const is_party = mode === "Party-wise";
    const is_head = mode === "Head-wise";
    const is_contra = mode === "Contra Entry";

    frm.toggle_display("party_details_section", false);
    frm.toggle_display("party", false);

    frm.toggle_display("party_rows_section", is_party);
    frm.toggle_display("party_rows", is_party);

    frm.toggle_display("headwise_section", is_head);
    frm.toggle_display("account_rows", is_head);

    frm.toggle_display("contra_section", is_contra);
    frm.toggle_display("transfer_from_account", is_contra);
    frm.toggle_display("contra_col_break", is_contra);
    frm.toggle_display("transfer_to_account", is_contra);

    frm.toggle_display("paid_from_account", !is_contra);
    frm.toggle_display("payment_method", !is_contra);

    frm.set_df_property("paid_from_account", "reqd", is_contra ? 0 : 1);
    frm.set_df_property("payment_method", "reqd", 0);

    frm.refresh_field("paid_from_account");
    frm.refresh_field("payment_method");
}

function clear_irrelevant_fields(frm) {
    if (frm.doc.entry_mode !== "Party-wise") {
        frm.set_value("party", "");
        frm.set_value("party_type", "");
        frm.set_value("party_name", "");
        frm.set_value("party_doctype", "");

        if (frm.doc.party_rows && frm.doc.party_rows.length) {
            frm.clear_table("party_rows");
            frm.refresh_field("party_rows");
        }
    }

    if (frm.doc.entry_mode !== "Contra Entry") {
        frm.set_value("transfer_from_account", "");
        frm.set_value("transfer_to_account", "");
    }

    if (frm.doc.entry_mode === "Contra Entry") {
        frm.set_value("paid_from_account", "");
        frm.set_value("payment_method", "");
    }

    if (frm.doc.entry_mode !== "Head-wise" && frm.doc.account_rows && frm.doc.account_rows.length) {
        frm.clear_table("account_rows");
        frm.refresh_field("account_rows");
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

function setup_party_row_autocomplete(frm) {
    if (!frm.fields_dict.party_rows || !frm.fields_dict.party_rows.grid) return;

    const wrapper = frm.fields_dict.party_rows.grid.wrapper;

    wrapper.off("focus.party_row_autocomplete", 'input[data-fieldname="party"]');
    wrapper.off("click.party_row_autocomplete", '[data-fieldname="party"]');
    wrapper.off("keydown.party_row_autocomplete", 'input[data-fieldname="party"]');

    wrapper.on("click.party_row_autocomplete", '[data-fieldname="party"]', function () {
        const $cell = $(this);
        setTimeout(() => {
            const $input = $cell.find('input[data-fieldname="party"]');
            if ($input.length) {
                $input.trigger("focus");
            }
        }, 50);
    });

    wrapper.on("focus.party_row_autocomplete", 'input[data-fieldname="party"]', function () {
        if (!window.Awesomplete) return;

        const input = this;
        const $input = $(input);

        setTimeout(() => {
            input.focus();
            try {
                const len = input.value ? input.value.length : 0;
                input.setSelectionRange(len, len);
            } catch (e) { }
        }, 10);

        let aws = $input.data("party_row_awesomplete");
        if (!aws) {
            aws = new Awesomplete(input, {
                minChars: 0,
                maxItems: 20,
                autoFirst: true,
                list: [],
                replace: function (suggestion) {
                    this.input.value = suggestion.value.party;
                }
            });
            $input.data("party_row_awesomplete", aws);

            input.addEventListener("input", frappe.utils.debounce(function (e) {
                const txt = e.target.value || "";

                frappe.call({
                    method: "simple_accounts_entry.api.search_parties",
                    args: {
                        txt: txt,
                        page_len: 20
                    },
                    callback: function (r) {
                        const rows = r.message || [];
                        aws.list = rows.map(row => ({
                            label: row.description,
                            value: row
                        }));
                        if (rows.length) {
                            aws.evaluate();
                            aws.open();
                        }
                    }
                });
            }, 300));

            input.addEventListener("awesomplete-selectcomplete", function (evt) {
                const selected = evt.text && evt.text.value ? evt.text.value : null;
                const rowname = $(input).attr("data-name");
                if (!selected || !rowname) return;

                const child = locals["Simple Payment Party Row"] && locals["Simple Payment Party Row"][rowname];
                if (!child) return;

                frappe.model.set_value(child.doctype, child.name, "party", selected.party || "");

                frappe.call({
                    method: "simple_accounts_entry.api.get_party_details",
                    args: {
                        party: selected.party || "",
                        party_type: selected.party_type || null
                    },
                    callback: function (r) {
                        const data = r.message || {};

                        frappe.model.set_value(child.doctype, child.name, "party_type", data.party_type || "");
                        frappe.model.set_value(child.doctype, child.name, "party_name", data.party_name || "");
                        frappe.model.set_value(child.doctype, child.name, "party_doctype", data.party_doctype || "");

                        if (cur_frm) {
                            cur_frm.refresh_field("party_rows");
                        }
                    }
                });
            });
        }
    });

    wrapper.on("keydown.party_row_autocomplete", 'input[data-fieldname="party"]', function (e) {
        if (e.key && e.key.length === 1) {
            const input = this;
            setTimeout(() => {
                input.focus();
            }, 0);
        }
    });
}

function populate_party_row_details(cdt, cdn) {
    const row = locals[cdt] && locals[cdt][cdn];
    if (!row) return;

    if (!row.party) {
        frappe.model.set_value(cdt, cdn, "party_type", "");
        frappe.model.set_value(cdt, cdn, "party_name", "");
        frappe.model.set_value(cdt, cdn, "party_doctype", "");
        if (cur_frm) {
            cur_frm.refresh_field("party_rows");
        }
        return;
    }

    frappe.call({
        method: "simple_accounts_entry.api.get_party_details",
        args: {
            party: row.party,
            party_type: row.party_type || null
        },
        callback: function (r) {
            const data = r.message || {};

            frappe.model.set_value(cdt, cdn, "party_type", data.party_type || "");
            frappe.model.set_value(cdt, cdn, "party_name", data.party_name || "");
            frappe.model.set_value(cdt, cdn, "party_doctype", data.party_doctype || "");

            if (cur_frm) {
                cur_frm.refresh_field("party_rows");
            }
        }
    });
}

function set_company_filters(frm) {
    frm.set_query("cost_center", function () {
        return {
            filters: {
                company: frm.doc.company,
                is_group: 0
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

    frm.set_query("transfer_from_account", function () {
        return {
            filters: {
                company: frm.doc.company,
                is_group: 0,
                account_type: ["in", ["Bank", "Cash", "Cash Over Short"]]
            }
        };
    });

    frm.set_query("transfer_to_account", function () {
        return {
            filters: {
                company: frm.doc.company,
                is_group: 0,
                account_type: ["in", ["Bank", "Cash", "Cash Over Short"]]
            }
        };
    });

    if (frm.fields_dict.account_rows && frm.fields_dict.account_rows.grid) {
        frm.fields_dict.account_rows.grid.get_field("cost_center").get_query = function (doc) {
            return {
                filters: {
                    company: doc.company,
                    is_group: 0
                }
            };
        };

        frm.fields_dict.account_rows.grid.get_field("project").get_query = function () {
            return {
                filters: {
                    company: frm.doc.company
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

function add_backend_navigation_button(frm) {
    if (!frm.doc.backend_doctype || !frm.doc.backend_document) return;
    if (frm.is_new()) return;

    frm.add_custom_button(__("Open Backend Document"), function () {
        if (
            locals[frm.doc.backend_doctype] &&
            locals[frm.doc.backend_doctype][frm.doc.backend_document]
        ) {
            delete locals[frm.doc.backend_doctype][frm.doc.backend_document];
        }

        frappe.set_route("Form", frm.doc.backend_doctype, frm.doc.backend_document);
    }, __("View"));
}

function set_headwise_grid_columns(frm) {
    if (frm.fields_dict.account_rows && frm.fields_dict.account_rows.grid) {
        frm.fields_dict.account_rows.grid.update_docfield_property("amount", "hidden", 1);
        frm.fields_dict.account_rows.grid.update_docfield_property("debit", "in_list_view", 1);
        frm.fields_dict.account_rows.grid.update_docfield_property("credit", "in_list_view", 1);
    }
}

function set_party_row_grid_columns(frm) {
    if (frm.fields_dict.party_rows && frm.fields_dict.party_rows.grid) {
        const grid = frm.fields_dict.party_rows.grid;

        grid.update_docfield_property("party", "hidden", 0);
        grid.update_docfield_property("party", "in_list_view", 1);

        grid.update_docfield_property("amount", "hidden", 0);
        grid.update_docfield_property("amount", "in_list_view", 1);

        grid.update_docfield_property("party_type", "hidden", 0);
        grid.update_docfield_property("party_type", "in_list_view", 1);
        grid.update_docfield_property("party_type", "read_only", 1);

        grid.update_docfield_property("party_name", "hidden", 1);
        grid.update_docfield_property("party_doctype", "hidden", 1);
    }
}

function set_reference_labels(frm) {
    let ref_no_label = __("Reference No");
    let ref_date_label = __("Reference Date");

    if (frm.doc.payment_method === "Bank") {
        ref_no_label = __("UTR No");
    } else if (frm.doc.payment_method === "Cheque") {
        ref_no_label = __("Cheque No");
        ref_date_label = __("Cheque Date");
    }

    frm.set_df_property("reference_no", "label", ref_no_label);
    frm.set_df_property("reference_date", "label", ref_date_label);

    frm.refresh_field("reference_no");
    frm.refresh_field("reference_date");
}