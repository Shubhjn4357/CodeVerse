# Database Scalability: Sharding & Replication

## 1. Read Replication

- Direct read queries to "read-only" replicas to scale out read heavy workloads.
- The master node handles all writes.

## 2. Horizontal Sharding

- Splitting data across multiple database instances based on a shard key (e.g., `user_id`, `region`).

## 3. Data Consistency

- Understand the trade-offs between strictly consistent systems and eventually consistent systems.

## 4. Failover & High Availability

- Configure automatic failover to a standby node if the master node goes down.

## 5. Partitioning

- Use database-level partitioning to split large tables into smaller, more manageable pieces within a single instance.
