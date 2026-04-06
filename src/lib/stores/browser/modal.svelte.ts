export class ModalStore {
  image = $state({ open: false, index: 0 });
  video = $state({ open: false });
  audio = $state({ open: false });
  pdf = $state({ open: false, path: "" });
  epub = $state({ open: false, path: "" });
  webtoon = $state({
    open: false,
    cbzPath: "",
    contextPath: "",
  });
  folderPicker = $state({ open: false });
}
