/// Windows Jump List にカスタムタスク（「新しいウィンドウ」）を追加する
#[cfg(windows)]
pub fn setup_jump_list() {
    if let Err(e) = setup_jump_list_inner() {
        eprintln!("Jump List 設定失敗: {e}");
    }
}

#[cfg(windows)]
fn setup_jump_list_inner() -> windows::core::Result<()> {
    use std::env;
    use windows::core::{Interface, HSTRING, GUID};
    use windows::Win32::Foundation::PROPERTYKEY;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
    use windows::Win32::UI::Shell::{
        DestinationList, EnumerableObjectCollection, ICustomDestinationList,
        IShellLinkW, ShellLink,
    };
    use windows::Win32::UI::Shell::Common::{IObjectArray, IObjectCollection};
    use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;

    // PKEY_Title = {F29F85E0-4FF9-1068-AB91-08002B27B3D9}, pid 2
    let pkey_title = PROPERTYKEY {
        fmtid: GUID {
            data1: 0xF29F85E0,
            data2: 0x4FF9,
            data3: 0x1068,
            data4: [0xAB, 0x91, 0x08, 0x00, 0x2B, 0x27, 0xB3, 0xD9],
        },
        pid: 2,
    };

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

        // Jump List 構築開始
        let dest_list: ICustomDestinationList =
            CoCreateInstance(&DestinationList, None, CLSCTX_INPROC_SERVER)?;
        let mut min_slots: u32 = 0;
        let _removed: IObjectArray = dest_list.BeginList(&mut min_slots)?;

        // 「新しいウィンドウ」タスク用の ShellLink
        let shell_link: IShellLinkW =
            CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;

        let exe_path = env::current_exe().map_err(|_| windows::core::Error::empty())?;
        let exe_hstring = HSTRING::from(exe_path.to_string_lossy().as_ref());

        shell_link.SetPath(&exe_hstring)?;
        shell_link.SetArguments(&HSTRING::from("--new-window"))?;
        shell_link.SetIconLocation(&exe_hstring, 0)?;

        // IPropertyStore 経由でタイトルを設定
        let prop_store: IPropertyStore = shell_link.cast()?;

        // VT_LPWSTR の PROPVARIANT を手動構築
        let title_wide: Vec<u16> = "新しいウィンドウ\0".encode_utf16().collect();
        let byte_len = title_wide.len() * std::mem::size_of::<u16>();
        let ptr = windows::Win32::System::Com::CoTaskMemAlloc(byte_len) as *mut u16;
        std::ptr::copy_nonoverlapping(title_wide.as_ptr(), ptr, title_wide.len());

        let mut pv: PROPVARIANT = std::mem::zeroed();
        // PROPVARIANT の内部構造に VT_LPWSTR (31) とポインタを設定
        let pv_ptr = &mut pv as *mut PROPVARIANT as *mut u8;
        // vt フィールドはオフセット 0 に u16
        *(pv_ptr as *mut u16) = 31; // VT_LPWSTR
        // pwszVal はオフセット 8 にポインタ
        *(pv_ptr.add(8) as *mut *mut u16) = ptr;

        prop_store.SetValue(&pkey_title, &pv)?;
        prop_store.Commit()?;

        // コレクションに追加して確定
        let collection: IObjectCollection =
            CoCreateInstance(&EnumerableObjectCollection, None, CLSCTX_INPROC_SERVER)?;
        collection.AddObject(&shell_link)?;

        let obj_array: IObjectArray = collection.cast()?;
        dest_list.AddUserTasks(&obj_array)?;
        dest_list.CommitList()?;
    }

    Ok(())
}
