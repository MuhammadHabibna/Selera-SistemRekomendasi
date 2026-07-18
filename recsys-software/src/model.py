"""Arsitektur NeuMF Hybrid: GMF + MLP + content branch (TF-IDF)."""
import torch
import torch.nn as nn


class NeuMFHybrid(nn.Module):
    """NeuMF hybrid 3 cabang: GMF, MLP, dan proyeksi content TF-IDF,
    digabung lewat fusion layer.

    Input forward : tensor user_idx, item_idx (long).
    Output forward: logit skor interaksi (belum sigmoid), shape [batch].
    """

    def __init__(self, n_users, n_items, content_dim, item_content_matrix,
                 gmf_dim=32, mlp_dim=32, mlp_hidden=(128, 64, 32),
                 content_proj_dim=32):
        super().__init__()
        self.user_emb_gmf = nn.Embedding(n_users, gmf_dim)
        self.item_emb_gmf = nn.Embedding(n_items, gmf_dim)
        self.user_emb_mlp = nn.Embedding(n_users, mlp_dim)
        self.item_emb_mlp = nn.Embedding(n_items, mlp_dim)

        mlp_layers = []
        input_dim = mlp_dim * 2
        for hidden_dim in mlp_hidden:
            mlp_layers += [nn.Linear(input_dim, hidden_dim), nn.ReLU(), nn.Dropout(0.2)]
            input_dim = hidden_dim
        self.mlp = nn.Sequential(*mlp_layers)

        self.content_proj = nn.Sequential(
            nn.Linear(content_dim, content_proj_dim), nn.ReLU()
        )
        # Content matrix adalah buffer (ikut device/checkpoint, tidak dilatih)
        self.register_buffer("item_content_matrix", item_content_matrix)

        fusion_input_dim = gmf_dim + mlp_hidden[-1] + content_proj_dim
        self.fusion = nn.Sequential(
            nn.Linear(fusion_input_dim, 64),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(64, 1),
        )

    def forward(self, user_idx, item_idx):
        gmf_out = self.user_emb_gmf(user_idx) * self.item_emb_gmf(item_idx)
        mlp_input = torch.cat(
            [self.user_emb_mlp(user_idx), self.item_emb_mlp(item_idx)], dim=1
        )
        mlp_out = self.mlp(mlp_input)
        content_out = self.content_proj(self.item_content_matrix[item_idx])
        fused = torch.cat([gmf_out, mlp_out, content_out], dim=1)
        return self.fusion(fused).squeeze(1)
