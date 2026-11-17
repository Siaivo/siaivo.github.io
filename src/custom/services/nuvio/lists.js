// Заглушка Library (D6). Контракт — temp/nuvio/api.md:
// sync_pull_library {p_profile_id, p_limit, p_offset},
// sync_get_library_delta_cursor, sync_pull_library_delta,
// sync_push_library_items {p_items, p_profile_id, p_origin_client_id?},
// sync_delete_library_items {p_keys, ...}.
// library_items — один watchlist без поняття списку:
// like/book/scheduled/thrown 1:1 не мапляться. Жодних викликів і UI.
export default {}
