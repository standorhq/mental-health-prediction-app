from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import (
    FunctionTransformer,
    OneHotEncoder,
    OrdinalEncoder,
    StandardScaler,
)


PROJECT_DIR = Path(__file__).resolve().parent
DATA_PATH = PROJECT_DIR / "Student Social Media And Mental Health Impact.csv"
MODEL_PATH = PROJECT_DIR / "Mental_Health_Model.pkl"


def main() -> None:
    df = pd.read_csv(DATA_PATH)
    df = df.drop_duplicates()
    df["Physical_Activity_Hours"] = df["Physical_Activity_Hours"].clip(lower=0)

    top_countries = df["Country"].value_counts().index[:10].tolist()
    df["Grouped_country"] = df["Country"].apply(
        lambda country: country if country in top_countries else "Other"
    )

    skewed_columns = ["Study_Hours"]
    numeric_columns = [
        "Age",
        "Avg_Daily_Usage_Hours",
        "Daily_Unlocks",
        "Physical_Activity_Hours",
        "Sleep_Hours_Per_Night",
    ]
    ordinal_columns = ["Stress_Level"]
    categorical_columns = [
        "Gender",
        "Academic_Level",
        "Most_Used_Platform",
        "Purpose_Of_Use",
        "Grouped_country",
    ]
    feature_columns = [
        "Study_Hours",
        "Age",
        "Avg_Daily_Usage_Hours",
        "Daily_Unlocks",
        "Physical_Activity_Hours",
        "Sleep_Hours_Per_Night",
        "Stress_Level",
        "Gender",
        "Academic_Level",
        "Most_Used_Platform",
        "Purpose_Of_Use",
        "Grouped_country",
    ]

    X = df[feature_columns]
    y = df["Mental_Health_Score"]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.30, random_state=42
    )

    skew_pipeline = Pipeline(
        steps=[
            ("log_transform", FunctionTransformer(np.log1p)),
            ("scale", StandardScaler()),
        ]
    )
    plain_numeric_pipeline = Pipeline(steps=[("scale", StandardScaler())])
    ordinal_pipeline = Pipeline(
        steps=[
            (
                "encode",
                OrdinalEncoder(
                    categories=[["Low", "Medium", "High", "Very High"]]
                ),
            )
        ]
    )
    nominal_pipeline = Pipeline(
        steps=[("encode", OneHotEncoder(handle_unknown="ignore"))]
    )

    preprocessor = ColumnTransformer(
        transformers=[
            ("Skewed_Pipeline", skew_pipeline, skewed_columns),
            ("Plain_Numeric", plain_numeric_pipeline, numeric_columns),
            ("Ordinal", ordinal_pipeline, ordinal_columns),
            ("Normal", nominal_pipeline, categorical_columns),
        ]
    )

    rf_pipeline = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("random forest", RandomForestRegressor(random_state=42)),
        ]
    )
    rf_pipeline.fit(X_train, y_train)

    predictions = rf_pipeline.predict(X_test)
    print(f"R2: {r2_score(y_test, predictions):.6f}")
    print(f"MAE: {mean_absolute_error(y_test, predictions):.6f}")

    joblib.dump(rf_pipeline, MODEL_PATH)
    print(f"Saved model to: {MODEL_PATH}")


if __name__ == "__main__":
    main()
