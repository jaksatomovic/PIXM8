import { useEffect } from "react";
import { UserModal, type UserForModal, type FaceItem } from "./UserModal";

export type { FaceItem };

type EditUserModalProps = {
  open: boolean;
  user: UserForModal | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  userFaces?: FaceItem[];
  getFaceImageUrl?: (userId: string, faceId: string) => Promise<string | null>;
  onLoadFaces?: () => void;
  onAddFace?: (file: File) => void;
  onDeleteFace?: (faceId: string) => void;
  uploadingFace?: boolean;
};

export function EditUserModal({
  open,
  user,
  onClose,
  onSaved,
  userFaces = [],
  getFaceImageUrl,
  onLoadFaces,
  onAddFace,
  onDeleteFace,
  uploadingFace = false,
}: EditUserModalProps) {
  useEffect(() => {
    if (open && user?.id && onLoadFaces) onLoadFaces();
  }, [open, user?.id, onLoadFaces]);

  return (
    <UserModal
      open={open}
      mode="edit"
      user={user}
      onClose={onClose}
      onSuccess={onSaved}
      faceFaces={userFaces}
      faceUserId={user?.id}
      getFaceImageUrl={getFaceImageUrl}
      onAddFace={onAddFace}
      onDeleteFace={onDeleteFace}
      uploadingFace={uploadingFace}
    />
  );
}
