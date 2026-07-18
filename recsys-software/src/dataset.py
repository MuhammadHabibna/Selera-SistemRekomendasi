"""PyTorch Dataset untuk pasangan (user, item, label)."""
import torch
from torch.utils.data import Dataset


class InteractionDataset(Dataset):
    """Dataset interaksi implisit.

    Input : DataFrame dengan kolom user_idx, item_idx, label_implicit.
    Output: tuple tensor (user, item, label) per index.
    """

    def __init__(self, df):
        self.users = torch.tensor(df["user_idx"].values, dtype=torch.long)
        self.items = torch.tensor(df["item_idx"].values, dtype=torch.long)
        self.labels = torch.tensor(df["label_implicit"].values, dtype=torch.float32)

    def __len__(self):
        return len(self.users)

    def __getitem__(self, idx):
        return self.users[idx], self.items[idx], self.labels[idx]
